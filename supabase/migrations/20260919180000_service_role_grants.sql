-- =============================================================
-- Migration: hak akses tabel untuk service_role
-- =============================================================
-- Webhook Telegram memakai service_role karena tidak punya session user.
--
-- Jebakannya halus: service_role memang MELEWATI RLS, tapi tetap butuh GRANT
-- level tabel. Melewati kebijakan baris bukan berarti punya izin menyentuh
-- tabelnya. Migrasi-migrasi sebelumnya cuma memberi hak ke `authenticated`,
-- sehingga setiap kueri webhook ditolak:
--
--   permission denied for table profiles (42501)
--
-- Gejalanya menyesatkan: bot menjawab "Nomor belum kedaftar" padahal barisnya
-- ada — kuerinya gagal, bukan tidak menemukan apa-apa.

-- Mencari pemilik nomor telepon saat menautkan akun.
grant select on public.profiles to service_role;

-- Menyimpan dan membaca tautan chat_id -> user_id.
grant select, insert, update on public.telegram_links to service_role;

-- Dedupe update: mencatat update_id yang sudah diproses.
grant select, insert on public.telegram_updates to service_role;

-- Menyimpan transaksi atas nama user. DELETE dipakai insertFromImage saat
-- menyingkirkan baris rekening koran yang ternyata sudah ada bukti bayarnya.
grant select, insert, delete on public.transactions to service_role;

-- Membaca daftar rekening user untuk mengenali transfer antar kantong sendiri.
grant select on public.user_accounts to service_role;
