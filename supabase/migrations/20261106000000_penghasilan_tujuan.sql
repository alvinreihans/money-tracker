-- Penghasilan & tujuan tabungan (SPEC-tujuan-tabungan, lanjutan fase 3).

-- 1. Penghasilan: kategori pemasukan yang menjadi basis metode budgeting.
--    Uang masuk lain (pemberian, refund, bunga, lainnya) tidak dibagi.
create or replace function private.penghasilan_bawaan(slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Gaji, Bonus/THR, Usaha, Freelance, dan kategori pemasukan buatan user
  -- (biasanya sumber penghasilan: kos-kosan, ojol).
  select slug not in ('gift', 'refund', 'investment', 'other');
$$;
revoke execute on function private.penghasilan_bawaan(text) from public, anon, authenticated;

alter table public.categories add column if not exists penghasilan boolean;

-- Trigger kategori yang sudah ada (security definer, 20261105000001) kini
-- juga mengisi penghasilan bawaan untuk kategori pemasukan.
create or replace function private.kategori_kelompok()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'expense' then
    new.kelompok := coalesce(new.kelompok, private.kelompok_bawaan(new.slug));
    new.penghasilan := null;
  else
    new.kelompok := null;
    new.penghasilan := coalesce(new.penghasilan, private.penghasilan_bawaan(new.slug));
  end if;
  return new;
end;
$$;
revoke execute on function private.kategori_kelompok() from public, anon, authenticated;

drop trigger if exists kategori_kelompok on public.categories;
create trigger kategori_kelompok
  before insert or update of kelompok, penghasilan, type on public.categories
  for each row execute function private.kategori_kelompok();

update public.categories set penghasilan = private.penghasilan_bawaan(slug) where type = 'income' and penghasilan is null;

-- Penghasilan per bulan yang diatur user; null = ikut saran aplikasi
-- (rerata penghasilan 3 bulan penuh terakhir).
alter table public.metode_budget add column if not exists penghasilan numeric(14, 2)
  check (penghasilan > 0);

-- 2. Tujuan tabungan: kantong berjenis "tujuan" dengan target & tenggat.
--    Menyisihkan = transfer ke kantong ini; memakai = pengeluaran darinya
--    (tidak dihitung di jatah bulanan metode).
alter table public.user_accounts drop constraint if exists user_accounts_kind_check;
alter table public.user_accounts
  add constraint user_accounts_kind_check
  check (kind in ('bank', 'ewallet', 'cash', 'orang', 'kredit', 'tujuan'));

alter table public.user_accounts add column if not exists target numeric(14, 2);
alter table public.user_accounts add column if not exists tenggat date;
alter table public.user_accounts drop constraint if exists user_accounts_target_check;
alter table public.user_accounts
  add constraint user_accounts_target_check
  check (case when kind = 'tujuan' then coalesce(target > 0, false) else target is null and tenggat is null end);

grant insert (target, tenggat) on public.user_accounts to authenticated;
grant update (target, tenggat) on public.user_accounts to authenticated;

-- 3. Transfer pelengkap: dibuat aksi "Dibayar dari tujuan tabungan" untuk
--    pengeluaran lama yang saldo tujuannya kurang. Menempel ke pengeluaran
--    itu dan ikut terhapus bersamanya.
alter table private.transaksi_data add column if not exists pelengkap_tujuan uuid
  references private.transaksi_data (id) on delete cascade;
create index if not exists idx_transaksi_pelengkap on private.transaksi_data (pelengkap_tujuan) where pelengkap_tujuan is not null;

-- View: kolom baru di akhir; isi lain sama dengan 20261105000000_metode_budget.sql.
create or replace view public.transactions with (security_barrier) as
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
  t.pelengkap_tujuan
from private.transaksi_data t
where t.user_id = auth.uid();

-- Trigger tulis: sama seperti 20261105000000_metode_budget.sql, ditambah pelengkap_tujuan.
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
      induk_id, cicilan_id, cicilan_ke, waktu, paylater, duplikat_dari, bukti_transfer_enc,
      kelompok, pecahan_dari, pelengkap_tujuan
    ) values (
      new.id, new.user_id, new.amount, new.type, new.category,
      extensions.pgp_sym_encrypt(new.merchant, k, opsi),
      extensions.pgp_sym_encrypt(new.description, k, opsi),
      new.transaction_date, new.created_at, new.payment_method, new.status,
      extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi),
      new.account, new.counterparty, new.source, new.external_id, new.kantong_id,
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
    account           = new.account,
    counterparty      = new.counterparty,
    source            = new.source,
    external_id       = new.external_id,
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
