-- Metode budgeting (SPEC-metode-budget, fase 3).

-- 1. Kelompok pengeluaran: kebutuhan, keinginan, tabungan (& investasi), berbagi.
--    Bawaan per kategori; boleh diubah per transaksi (null = ikut kategori).
create or replace function private.kelompok_bawaan(slug text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when slug in ('food', 'groceries', 'transport', 'health', 'bills', 'fees') then 'kebutuhan'
    -- Belanja, Hiburan, Lainnya, dan kategori buatan user yang tidak dikenal:
    -- diawasi sebagai keinginan sampai user memilih lain.
    else 'keinginan'
  end;
$$;
revoke execute on function private.kelompok_bawaan(text) from public, anon, authenticated;

alter table public.categories add column if not exists kelompok text
  check (kelompok in ('kebutuhan', 'keinginan', 'tabungan', 'berbagi'));

-- Kategori pengeluaran tanpa kelompok (seed user baru, kategori buatan versi
-- lama) diisi bawaannya; kategori pemasukan tidak berkelompok.
create or replace function private.kategori_kelompok()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'expense' then
    new.kelompok := coalesce(new.kelompok, private.kelompok_bawaan(new.slug));
  else
    new.kelompok := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.kategori_kelompok() from public, anon, authenticated;

drop trigger if exists kategori_kelompok on public.categories;
create trigger kategori_kelompok
  before insert or update of kelompok, type on public.categories
  for each row execute function private.kategori_kelompok();

update public.categories set kelompok = private.kelompok_bawaan(slug) where type = 'expense' and kelompok is null;

alter table private.transaksi_data add column if not exists kelompok text
  check (kelompok in ('kebutuhan', 'keinginan', 'tabungan', 'berbagi'));

-- 2. Pecah transaksi: bagian lain dari satu transaksi (tampil sebagai satu),
--    terhapus bersama transaksi aslinya.
alter table private.transaksi_data add column if not exists pecahan_dari uuid
  references private.transaksi_data (id) on delete cascade;
create index if not exists idx_transaksi_pecahan on private.transaksi_data (pecahan_dari) where pecahan_dari is not null;

-- View: kolom baru di akhir (create or replace view hanya boleh menambah di
-- akhir) — default & grant view tetap.
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
  ) end as kelompok_efektif
from private.transaksi_data t
where t.user_id = auth.uid();

-- Trigger tulis: sama seperti 20261104000000_arah_transfer.sql, ditambah kelompok & pecahan_dari.
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
      kelompok, pecahan_dari
    ) values (
      new.id, new.user_id, new.amount, new.type, new.category,
      extensions.pgp_sym_encrypt(new.merchant, k, opsi),
      extensions.pgp_sym_encrypt(new.description, k, opsi),
      new.transaction_date, new.created_at, new.payment_method, new.status,
      extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi),
      new.account, new.counterparty, new.source, new.external_id, new.kantong_id,
      new.kantong_tujuan_id, new.induk_id, new.cicilan_id, new.cicilan_ke, new.waktu, new.paylater, new.duplikat_dari,
      extensions.pgp_sym_encrypt(new.bukti_transfer, k, opsi),
      new.kelompok, new.pecahan_dari
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
    pecahan_dari      = new.pecahan_dari
  where id = old.id and user_id = auth.uid();
  return new;
end;
$$;
revoke execute on function private.transactions_tulis() from public, anon, authenticated;

-- Bagian baru menyalin isian bersama dari transaksi aslinya.
create or replace function private.pecahan_salin_asli()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  asli private.transaksi_data;
begin
  select * into asli from private.transaksi_data where id = new.pecahan_dari;
  if found then
    new.transaction_date  := asli.transaction_date;
    new.waktu             := asli.waktu;
    new.created_at        := asli.created_at;
    new.kantong_id        := asli.kantong_id;
    new.kantong_tujuan_id := asli.kantong_tujuan_id;
    new.payment_method    := asli.payment_method;
    new.merchant_enc      := asli.merchant_enc;
    new.type              := asli.type;
    new.status            := asli.status;
  end if;
  return new;
end;
$$;
revoke execute on function private.pecahan_salin_asli() from public, anon, authenticated;

drop trigger if exists pecahan_salin_asli on private.transaksi_data;
create trigger pecahan_salin_asli
  before insert on private.transaksi_data
  for each row when (new.pecahan_dari is not null)
  execute function private.pecahan_salin_asli();

-- Transaksi asli diubah (edit, koreksi, jawaban): bagiannya ikut.
create or replace function private.pecahan_ikut_asli()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update private.transaksi_data set
    transaction_date  = new.transaction_date,
    waktu             = new.waktu,
    kantong_id        = new.kantong_id,
    kantong_tujuan_id = new.kantong_tujuan_id,
    payment_method    = new.payment_method,
    merchant_enc      = new.merchant_enc,
    type              = new.type,
    status            = new.status
  where pecahan_dari = new.id;
  return null;
end;
$$;
revoke execute on function private.pecahan_ikut_asli() from public, anon, authenticated;

drop trigger if exists pecahan_ikut_asli on private.transaksi_data;
create trigger pecahan_ikut_asli
  after update of transaction_date, waktu, kantong_id, kantong_tujuan_id, payment_method, merchant_enc, type, status
  on private.transaksi_data
  for each row when (new.pecahan_dari is null)
  execute function private.pecahan_ikut_asli();

-- 3. Metode budgeting pilihan user. Tanpa baris = "kategori" (budget per kategori).
create table if not exists public.metode_budget (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  metode     text not null check (metode in ('kategori', '50-30-20', '80-20', '70-20-10', 'kustom')),
  -- Hanya kustom: {"kebutuhan": 50, "keinginan": 30, "tabungan": 15, "berbagi": 5}.
  persen     jsonb,
  updated_at timestamptz not null default now()
);
alter table public.metode_budget enable row level security;
drop policy if exists "metode_budget milik sendiri" on public.metode_budget;
create policy "metode_budget milik sendiri" on public.metode_budget
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.metode_budget to authenticated;
