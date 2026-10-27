-- Normalisasi database (SPEC-normalisasi.md). View public.transactions tetap
-- mengembalikan kolom yang sama (kecuali kolom lama yang dibuang), jadi kode
-- aplikasi tidak perlu tahu bentuk penyimpanannya.

-- 0. Fungsi bantu di skema private yang dipanggil lewat trigger tulisan user:
--    security definer (pelajaran 20261105000001_kategori_kelompok_definer.sql).

-- Perbaikan bug yang sudah ada: trigger ikutan & pecahan di transaksi_data
-- berjalan sebagai pemanggil. Lewat view (transactions_tulis, security
-- definer) itu aman, tapi saat database sendiri mengubah baris transaksi atas
-- nama user biasa — mis. kantong_tujuan_id di-NULL-kan karena kantongnya
-- dihapus — user ditolak "permission denied for schema private", jadi
-- kantong yang punya transaksi tidak bisa dihapus. Isinya tidak berubah.
alter function private.ikutan_ikut_induk() security definer;
alter function private.ikutan_salin_induk() security definer;
alter function private.ikutan_sesuai_jenis() security definer;
alter function private.pecahan_ikut_asli() security definer;
alter function private.pecahan_salin_asli() security definer;

-- #3 + #1: bentuk tersimpan. Pindah kantong tidak berkategori (NULL); nama
-- kantong tidak disalin bila kantongnya tertaut (dibaca view dari user_accounts).
create or replace function private.transaksi_normal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'transfer' then
    new.category := null;
  end if;
  if new.kantong_id is not null then
    new.payment_method := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.transaksi_normal() from public, anon, authenticated;

-- #5: updated_at untuk tabel mana pun yang punya kolomnya.
create or replace function private.isi_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.isi_updated_at() from public, anon, authenticated;

-- Kantong dihapus: transaksinya tetap ada dan lepas dari kantong (seperti
-- dulu), tapi namanya disimpan sebagai teks supaya detailnya masih menyebut
-- "BCA". Dulu nama ini memang salinan; sekarang hanya disalin saat kantongnya hilang.
create or replace function private.kantong_dihapus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.transaksi_data set kantong_id = null, payment_method = old.name where kantong_id = old.id;
  return old;
end;
$$;
revoke execute on function private.kantong_dihapus() from public, anon, authenticated;

-- 1. View lama dibuang dulu: kolomnya akan dibuang, dan Postgres tidak bisa
--    membuang kolom dari view. Tidak ada view/fungsi lain yang bergantung padanya.
drop view public.transactions;

-- #4: kolom sisa impor rekening koran (semuanya kosong).
drop index if exists private.idx_transactions_external;
alter table private.transaksi_data drop column account, drop column counterparty, drop column external_id;

-- #1 + #3: data lama ke bentuk tersimpan.
alter table private.transaksi_data alter column category drop not null;
update private.transaksi_data set category = null where type = 'transfer';
update private.transaksi_data set payment_method = null where kantong_id is not null;
alter table private.transaksi_data
  add constraint transaksi_data_kategori_check check (type = 'transfer' or category is not null);

drop trigger if exists transaksi_normal on private.transaksi_data;
create trigger transaksi_normal
  before insert or update on private.transaksi_data
  for each row execute function private.transaksi_normal();

-- #1: FK kategori. NO ACTION dicek di akhir pernyataan: menghapus akun
-- (cascade ke kategori & transaksi sekaligus) tetap jalan.
alter table private.transaksi_data
  add constraint transaksi_data_kategori_fkey foreign key (user_id, type, category)
  references public.categories (user_id, type, slug) on update cascade;

alter table public.budgets add column if not exists type text not null default 'expense' check (type = 'expense');
alter table public.budgets
  add constraint budgets_kategori_fkey foreign key (user_id, type, category)
  references public.categories (user_id, type, slug) on update cascade on delete cascade;

alter table public.cicilan add column if not exists type text not null default 'expense' check (type = 'expense');
alter table public.cicilan
  add constraint cicilan_kategori_fkey foreign key (user_id, type, category)
  references public.categories (user_id, type, slug) on update cascade;

-- Hapus kategori: rencana cicilannya juga pindah ke Lainnya (sebelumnya
-- terlewat; dengan FK, kategori yang dipakai cicilan tidak bisa dihapus).
create or replace function public.hapus_kategori(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.categories;
  pindah integer;
begin
  select * into k from public.categories where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'Kategori tidak ditemukan';
  end if;
  if k.slug = 'other' then
    raise exception 'Kategori Lainnya tidak bisa dihapus';
  end if;

  update public.transactions
    set category = 'other'
    where user_id = auth.uid() and type = k.type and category = k.slug;
  get diagnostics pindah = row_count;

  if k.type = 'expense' then
    delete from public.budgets where user_id = auth.uid() and category = k.slug;
    update public.cicilan set category = 'other' where user_id = auth.uid() and category = k.slug;
  end if;

  delete from public.categories where id = k.id;
  return pindah;
end;
$$;

-- #2: indeks kolom FK.
create index if not exists idx_transaksi_kantong on private.transaksi_data (kantong_id) where kantong_id is not null;
create index if not exists idx_transaksi_kantong_tujuan on private.transaksi_data (kantong_tujuan_id) where kantong_tujuan_id is not null;
create index if not exists idx_transaksi_duplikat on private.transaksi_data (duplikat_dari) where duplikat_dari is not null;
create index if not exists idx_cicilan_user on public.cicilan (user_id);
create index if not exists idx_cicilan_kantong on public.cicilan (kantong_id) where kantong_id is not null;
create index if not exists idx_draft_catat_user on private.draft_catat (user_id);

-- #5: updated_at.
alter table private.transaksi_data add column if not exists updated_at timestamptz not null default now();
alter table public.categories add column if not exists updated_at timestamptz not null default now();
alter table public.user_accounts add column if not exists updated_at timestamptz not null default now();
alter table public.cicilan add column if not exists updated_at timestamptz not null default now();

drop trigger if exists isi_updated_at on private.transaksi_data;
create trigger isi_updated_at before update on private.transaksi_data for each row execute function private.isi_updated_at();
drop trigger if exists isi_updated_at on public.categories;
create trigger isi_updated_at before update on public.categories for each row execute function private.isi_updated_at();
drop trigger if exists isi_updated_at on public.user_accounts;
create trigger isi_updated_at before update on public.user_accounts for each row execute function private.isi_updated_at();
drop trigger if exists isi_updated_at on public.cicilan;
create trigger isi_updated_at before update on public.cicilan for each row execute function private.isi_updated_at();

drop trigger if exists kantong_dihapus on public.user_accounts;
create trigger kantong_dihapus before delete on public.user_accounts for each row execute function private.kantong_dihapus();

-- #7: jatuh tempo hanya untuk pinjaman orang & tagihan kartu kredit.
alter table public.user_accounts
  add constraint user_accounts_jatuh_tempo_check check (jatuh_tempo is null or kind in ('orang', 'kredit'));

-- 2. View baru: kolom sama dengan sebelumnya tanpa account, counterparty,
--    external_id; ditambah updated_at di akhir.
create view public.transactions with (security_barrier) as
select
  t.id,
  t.user_id,
  t.amount,
  t.type,
  -- Pindah kantong tidak berkategori di penyimpanan; aplikasi tetap melihat "other".
  coalesce(t.category, 'other') as category,
  extensions.pgp_sym_decrypt(t.merchant_enc, (select private.kunci_transaksi())) as merchant,
  extensions.pgp_sym_decrypt(t.description_enc, (select private.kunci_transaksi())) as description,
  t.transaction_date,
  t.created_at,
  -- Nama kantong saat ini; teks tersimpan hanya untuk yang belum/tidak lagi berkantong.
  coalesce((select a.name from public.user_accounts a where a.id = t.kantong_id), t.payment_method) as payment_method,
  t.status,
  extensions.pgp_sym_decrypt(t.raw_ocr_text_enc, (select private.kunci_transaksi())) as raw_ocr_text,
  t.source,
  t.kantong_id,
  t.kantong_tujuan_id,
  t.induk_id,
  t.cicilan_id,
  t.cicilan_ke,
  t.waktu,
  t.paylater,
  t.duplikat_dari,
  extensions.pgp_sym_decrypt(t.bukti_transfer_enc, (select private.kunci_transaksi())) as bukti_transfer,
  t.kelompok,
  t.pecahan_dari,
  -- Kelompok yang berlaku: pilihan transaksi itu, atau bawaan kategorinya.
  case when t.type = 'expense' then coalesce(
    t.kelompok,
    (select c.kelompok from public.categories c where c.user_id = t.user_id and c.type = 'expense' and c.slug = t.category),
    'keinginan'
  ) end as kelompok_efektif,
  t.pelengkap_tujuan,
  t.updated_at
from private.transaksi_data t
where t.user_id = auth.uid();

-- Nilai bawaan & hak view lama (20261027000000_enkripsi.sql, 20260919180000_service_role_grants.sql).
-- Kategori bawaan kini 'other' (Lainnya): 'uncategorized' tidak ada di categories dan ditolak FK.
alter view public.transactions alter column id set default gen_random_uuid();
alter view public.transactions alter column type set default 'expense';
alter view public.transactions alter column category set default 'other';
alter view public.transactions alter column transaction_date set default current_date;
alter view public.transactions alter column created_at set default now();
alter view public.transactions alter column status set default 'confirmed';
alter view public.transactions alter column source set default 'receipt';
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, delete on public.transactions to service_role;

-- Trigger tulis: sama seperti 20261106000000_penghasilan_tujuan.sql, tanpa
-- kolom lama. Bentuk tersimpan (category/payment_method) diatur transaksi_normal.
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
      source, kantong_id, kantong_tujuan_id,
      induk_id, cicilan_id, cicilan_ke, waktu, paylater, duplikat_dari, bukti_transfer_enc,
      kelompok, pecahan_dari, pelengkap_tujuan
    ) values (
      new.id, new.user_id, new.amount, new.type, new.category,
      extensions.pgp_sym_encrypt(new.merchant, k, opsi),
      extensions.pgp_sym_encrypt(new.description, k, opsi),
      new.transaction_date, new.created_at, new.payment_method, new.status,
      extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi),
      new.source, new.kantong_id,
      new.kantong_tujuan_id, new.induk_id, new.cicilan_id, new.cicilan_ke, new.waktu, new.paylater, new.duplikat_dari,
      extensions.pgp_sym_encrypt(new.bukti_transfer, k, opsi),
      new.kelompok, new.pecahan_dari, new.pelengkap_tujuan
    );
    return new;
  end if;

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
    source            = new.source,
    kantong_id        = new.kantong_id,
    kantong_tujuan_id = new.kantong_tujuan_id,
    induk_id          = new.induk_id,
    cicilan_id        = new.cicilan_id,
    cicilan_ke        = new.cicilan_ke,
    waktu             = new.waktu,
    paylater          = new.paylater,
    duplikat_dari     = new.duplikat_dari,
    bukti_transfer_enc = case when new.bukti_transfer is not distinct from old.bukti_transfer then bukti_transfer_enc
                              else extensions.pgp_sym_encrypt(new.bukti_transfer, k, opsi) end,
    kelompok          = new.kelompok,
    pecahan_dari      = new.pecahan_dari,
    pelengkap_tujuan  = new.pelengkap_tujuan
  where id = old.id and user_id = auth.uid();
  return new;
end;
$$;
revoke execute on function private.transactions_tulis() from public, anon, authenticated;

create trigger transactions_tulis
  instead of insert or update or delete on public.transactions
  for each row execute function private.transactions_tulis();
