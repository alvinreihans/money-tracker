-- =============================================================
-- Migration: enkripsi merchant, keterangan & teks OCR transaksi
-- (SPEC-enkripsi.md, disetujui 22 Okt 2026)
--
--   app ──▶ VIEW public.transactions (teks polos, hanya baris milik auth.uid())
--             │ trigger INSTEAD OF: enkripsi saat tulis
--             ▼
--           TABEL private.transaksi_data (merchant_enc, description_enc,
--                                         raw_ocr_text_enc: bytea)
--
-- Kunci di Supabase Vault ("kunci_transaksi"), tidak ikut dump database.
-- Simpan salinannya di password manager (SQL Editor):
--   select decrypted_secret from vault.decrypted_secrets where name = 'kunci_transaksi';
--
-- Mulai sekarang mengubah kolom transaksi = alter private.transaksi_data,
-- lalu buat ulang view & trigger di bawah. Balik: supabase/rollback/.
-- =============================================================

-- 1. Kunci. Dibuat sekali; migrasi ulang tidak menggantinya.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'kunci_transaksi') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'kunci_transaksi',
      'Kunci enkripsi merchant/keterangan/teks OCR transaksi. Hilang = teks tidak terbaca.'
    );
  end if;
end $$;

-- Skema yang tidak diekspos API: user tidak punya USAGE, jadi isinya tidak
-- bisa disentuh langsung — hanya lewat view & trigger (milik postgres).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Security definer: fungsi di dalam view dijalankan sebagai user pemanggil,
-- yang tidak boleh membaca Vault. EXECUTE untuk authenticated dibutuhkan
-- view; tanpa USAGE skema private, user tetap tidak bisa memanggilnya sendiri.
-- Gagal keras kalau kunci hilang: lebih baik error daripada teks tersimpan NULL.
create or replace function private.kunci_transaksi()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'kunci_transaksi';
  if k is null then
    raise exception 'kunci_transaksi tidak ada di Vault';
  end if;
  return k;
end;
$$;
revoke execute on function private.kunci_transaksi() from public, anon;
grant execute on function private.kunci_transaksi() to authenticated;

-- 2. Tabel asli pindah ke skema private. Index, constraint, FK, dan policy
--    RLS ikut pindah.
alter table public.transactions rename to transaksi_data;
alter table public.transaksi_data set schema private;
revoke all on private.transaksi_data from anon, authenticated, service_role;

-- 3. Enkripsi data lama, lalu buang teks polosnya. s2k-mode=1: kuncinya
--    sudah 256 bit acak, jadi iterasi S2K (mode 3, bawaan) hanya memperlambat
--    tiap baris tanpa menambah keamanan.
alter table private.transaksi_data
  add column merchant_enc bytea,
  add column description_enc bytea,
  add column raw_ocr_text_enc bytea;

update private.transaksi_data set
  merchant_enc     = extensions.pgp_sym_encrypt(merchant,     private.kunci_transaksi(), 'cipher-algo=aes256, s2k-mode=1'),
  description_enc  = extensions.pgp_sym_encrypt(description,  private.kunci_transaksi(), 'cipher-algo=aes256, s2k-mode=1'),
  raw_ocr_text_enc = extensions.pgp_sym_encrypt(raw_ocr_text, private.kunci_transaksi(), 'cipher-algo=aes256, s2k-mode=1');

alter table private.transaksi_data
  drop column merchant,
  drop column description,
  drop column raw_ocr_text;

-- 4. View dengan kolom & urutan persis seperti tabel lama.
--    - Dijalankan sebagai pemiliknya (postgres), jadi filter auth.uid() di
--      sini yang menggantikan RLS. security_barrier: filter dari user (mis.
--      ilike) baru dievaluasi setelah filter user_id, jadi tidak bisa
--      membocorkan baris orang lain.
--    - (select kunci) = InitPlan: Vault dibaca sekali per query, bukan per
--      baris, dan hanya kalau kolom teksnya diminta.
-- ponytail: pencarian Riwayat mendekripsi tiap baris yang lolos filter lain
-- (~ribuan baris/detik); indeks hash per kata kalau sudah terasa lambat.
create view public.transactions with (security_barrier) as
select
  t.id,
  t.user_id,
  t.amount,
  t.type,
  t.category,
  extensions.pgp_sym_decrypt(t.merchant_enc, (select private.kunci_transaksi())) as merchant,
  extensions.pgp_sym_decrypt(t.description_enc, (select private.kunci_transaksi())) as description,
  t.transaction_date,
  t.created_at,
  t.payment_method,
  t.status,
  extensions.pgp_sym_decrypt(t.raw_ocr_text_enc, (select private.kunci_transaksi())) as raw_ocr_text,
  t.account,
  t.counterparty,
  t.source,
  t.external_id,
  t.kantong_id,
  t.kantong_tujuan_id,
  t.induk_id,
  t.cicilan_id,
  t.cicilan_ke
from private.transaksi_data t
where t.user_id = auth.uid();

-- Default tabel lama, supaya insert yang tidak menyebut kolom ini (dan
-- RETURNING-nya) tetap sama seperti dulu.
alter view public.transactions alter column id set default gen_random_uuid();
alter view public.transactions alter column type set default 'expense';
alter view public.transactions alter column category set default 'uncategorized';
alter view public.transactions alter column transaction_date set default current_date;
alter view public.transactions alter column created_at set default now();
alter view public.transactions alter column status set default 'confirmed';
alter view public.transactions alter column source set default 'receipt';

revoke all on public.transactions from anon, authenticated, service_role;
grant select, insert, update, delete on public.transactions to authenticated;

-- 5. Tulis lewat view. OLD selalu milik user (view sudah memfilter);
--    NEW.user_id diperiksa supaya tidak bisa menulis atas nama orang lain.
create or replace function private.transactions_tulis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  opsi constant text := 'cipher-algo=aes256, s2k-mode=1';
begin
  if tg_op = 'DELETE' then
    delete from private.transaksi_data where id = old.id and user_id = auth.uid();
    return old;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'Transaksi ini bukan milikmu' using errcode = '42501';
  end if;
  k := private.kunci_transaksi();

  if tg_op = 'INSERT' then
    insert into private.transaksi_data (
      id, user_id, amount, type, category, merchant_enc, description_enc,
      transaction_date, created_at, payment_method, status, raw_ocr_text_enc,
      account, counterparty, source, external_id, kantong_id, kantong_tujuan_id,
      induk_id, cicilan_id, cicilan_ke
    ) values (
      new.id, new.user_id, new.amount, new.type, new.category,
      extensions.pgp_sym_encrypt(new.merchant, k, opsi),
      extensions.pgp_sym_encrypt(new.description, k, opsi),
      new.transaction_date, new.created_at, new.payment_method, new.status,
      extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi),
      new.account, new.counterparty, new.source, new.external_id, new.kantong_id,
      new.kantong_tujuan_id, new.induk_id, new.cicilan_id, new.cicilan_ke
    );
    return new;
  end if;

  -- Teks yang tidak berubah tidak dienkripsi ulang (mis. hapus_kategori
  -- yang hanya mengganti kategori).
  update private.transaksi_data set
    amount            = new.amount,
    type              = new.type,
    category          = new.category,
    merchant_enc      = case when new.merchant is not distinct from old.merchant then merchant_enc
                             else extensions.pgp_sym_encrypt(new.merchant, k, opsi) end,
    description_enc   = case when new.description is not distinct from old.description then description_enc
                             else extensions.pgp_sym_encrypt(new.description, k, opsi) end,
    transaction_date  = new.transaction_date,
    created_at        = new.created_at,
    payment_method    = new.payment_method,
    status            = new.status,
    raw_ocr_text_enc  = case when new.raw_ocr_text is not distinct from old.raw_ocr_text then raw_ocr_text_enc
                             else extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi) end,
    account           = new.account,
    counterparty      = new.counterparty,
    source            = new.source,
    external_id       = new.external_id,
    kantong_id        = new.kantong_id,
    kantong_tujuan_id = new.kantong_tujuan_id,
    induk_id          = new.induk_id,
    cicilan_id        = new.cicilan_id,
    cicilan_ke        = new.cicilan_ke
  where id = old.id and user_id = auth.uid();
  return new;
end;
$$;
revoke execute on function private.transactions_tulis() from public, anon, authenticated;

create trigger transactions_tulis
  instead of insert or update or delete on public.transactions
  for each row execute function private.transactions_tulis();

notify pgrst, 'reload schema';
