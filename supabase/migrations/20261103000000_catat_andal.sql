-- Catat yang lebih andal (SPEC-catat-andal.md).

-- 1. Penanda draft yang dicurigai duplikat: id transaksi yang sama persis
--    (nominal, jenis, tanggal, jam, kantong). Kosong lagi kalau transaksi
--    itu dihapus — draft-nya lalu jadi draft biasa.
alter table private.transaksi_data add column if not exists duplikat_dari uuid
  references private.transaksi_data (id) on delete set null;

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
  t.duplikat_dari
from private.transaksi_data t
where t.user_id = auth.uid();

-- Trigger tulis: sama seperti 20261027000000_enkripsi.sql, ditambah waktu, paylater & duplikat_dari.
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
      induk_id, cicilan_id, cicilan_ke, waktu, paylater, duplikat_dari
    ) values (
      new.id, new.user_id, new.amount, new.type, new.category,
      extensions.pgp_sym_encrypt(new.merchant, k, opsi),
      extensions.pgp_sym_encrypt(new.description, k, opsi),
      new.transaction_date, new.created_at, new.payment_method, new.status,
      extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi),
      new.account, new.counterparty, new.source, new.external_id, new.kantong_id,
      new.kantong_tujuan_id, new.induk_id, new.cicilan_id, new.cicilan_ke, new.waktu, new.paylater, new.duplikat_dari
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
    duplikat_dari     = new.duplikat_dari
  where id = old.id and user_id = auth.uid();
  return new;
end;
$$;
revoke execute on function private.transactions_tulis() from public, anon, authenticated;

-- 2. Biaya admin hanya untuk pindah kantong, cashback hanya untuk belanja:
--    begitu jenis induk berubah (edit, koreksi obrolan, jawaban), ikutan yang
--    tidak cocok lagi dihapus — kalau tidak, ia diam-diam memotong saldo.
create or replace function private.ikutan_sesuai_jenis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from private.transaksi_data
   where induk_id = new.id
     and ((new.type <> 'transfer' and type = 'expense' and category = 'fees')
       or (new.type <> 'expense' and type = 'income' and category = 'refund'));
  return null;
end;
$$;
revoke execute on function private.ikutan_sesuai_jenis() from public, anon, authenticated;

drop trigger if exists ikutan_sesuai_jenis on private.transaksi_data;
create trigger ikutan_sesuai_jenis
  after update of type on private.transaksi_data
  for each row when (new.induk_id is null and new.type is distinct from old.type)
  execute function private.ikutan_sesuai_jenis();

-- Data lama: ikutan yang sudah telanjur tidak cocok dengan induknya.
delete from private.transaksi_data c
 using private.transaksi_data p
 where c.induk_id = p.id
   and ((p.type <> 'transfer' and c.type = 'expense' and c.category = 'fees')
     or (p.type <> 'expense' and c.type = 'income' and c.category = 'refund'));
