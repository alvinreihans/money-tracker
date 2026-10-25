-- Arah bukti transfer (SPEC-catat-tuntas).
--
-- Bukti transfer antar dua pihak yang arahnya belum bisa dipastikan (bukan
-- dari nama user maupun kantongnya) menunggu jawaban "kirim atau terima?".
-- Nama & bank pengirim/penerima disimpan sementara di sini — terenkripsi
-- seperti merchant, karena berisi nama orang — lalu dikosongkan begitu
-- arahnya dijawab.
alter table private.transaksi_data add column if not exists bukti_transfer_enc bytea;

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
  extensions.pgp_sym_decrypt(t.bukti_transfer_enc, (select private.kunci_transaksi())) as bukti_transfer
from private.transaksi_data t
where t.user_id = auth.uid();

-- Trigger tulis: sama seperti 20261103000000_catat_andal.sql, ditambah bukti_transfer.
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
      induk_id, cicilan_id, cicilan_ke, waktu, paylater, duplikat_dari, bukti_transfer_enc
    ) values (
      new.id, new.user_id, new.amount, new.type, new.category,
      extensions.pgp_sym_encrypt(new.merchant, k, opsi),
      extensions.pgp_sym_encrypt(new.description, k, opsi),
      new.transaction_date, new.created_at, new.payment_method, new.status,
      extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi),
      new.account, new.counterparty, new.source, new.external_id, new.kantong_id,
      new.kantong_tujuan_id, new.induk_id, new.cicilan_id, new.cicilan_ke, new.waktu, new.paylater, new.duplikat_dari,
      extensions.pgp_sym_encrypt(new.bukti_transfer, k, opsi)
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
                              else extensions.pgp_sym_encrypt(new.bukti_transfer, k, opsi) end
  where id = old.id and user_id = auth.uid();
  return new;
end;
$$;
revoke execute on function private.transactions_tulis() from public, anon, authenticated;
