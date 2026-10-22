-- =============================================================
-- BALIKAN 20261027000000_enkripsi.sql: teks polos kembali ke tabel
-- public.transactions. Hanya kalau enkripsinya bermasalah.
--
-- Jalankan di Supabase Dashboard → SQL Editor (paste seluruh isi file, Run),
-- lalu hapus catatannya supaya migrasi bisa dijalankan lagi nanti:
--   delete from public._migrations where name = '20261027000000_enkripsi.sql';
-- Kunci di Vault sengaja tidak dihapus.
-- =============================================================
begin;

drop view public.transactions;  -- trigger ikut terhapus

alter table private.transaksi_data
  add column merchant text,
  add column description text,
  add column raw_ocr_text text;

update private.transaksi_data set
  merchant     = extensions.pgp_sym_decrypt(merchant_enc,     private.kunci_transaksi()),
  description  = extensions.pgp_sym_decrypt(description_enc,  private.kunci_transaksi()),
  raw_ocr_text = extensions.pgp_sym_decrypt(raw_ocr_text_enc, private.kunci_transaksi());

alter table private.transaksi_data
  drop column merchant_enc,
  drop column description_enc,
  drop column raw_ocr_text_enc;

alter table private.transaksi_data set schema public;
alter table public.transaksi_data rename to transactions;

revoke all on public.transactions from anon, authenticated, service_role;
grant select, insert, update, delete on public.transactions to authenticated;

drop function private.transactions_tulis();
drop function private.kunci_transaksi();
drop schema private;

notify pgrst, 'reload schema';
commit;
