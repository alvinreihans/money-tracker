-- =============================================================
-- Migration: pengetatan hak akses & hapus sisa fitur Telegram
-- (KAJIAN-KEAMANAN-DATA, 22 Okt 2026)
-- =============================================================

-- 1. Hak yang tidak pernah dipakai aplikasi. TRUNCATE melewati RLS; walau
--    tidak bisa dipanggil lewat API (PostgREST tidak punya TRUNCATE), pintu
--    yang tidak perlu ditutup. Juga untuk tabel yang dibuat nanti.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- 2. Catatan migrasi: hanya dipakai penjalan migrasi (role postgres, yang
--    tidak tunduk RLS). Aktifkan RLS tanpa policy = tertutup untuk API.
alter table public._migrations enable row level security;
revoke all on public._migrations from anon, authenticated;

-- 3. Fungsi: bawaan Postgres memberi EXECUTE ke semua orang (PUBLIC). Cabut,
--    lalu beri hanya yang dipanggil aplikasi lewat RPC.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
grant execute on function public.get_avg_monthly_expense_by_category() to authenticated;
grant execute on function public.hapus_kategori(uuid) to authenticated;
-- Trigger pendaftaran dijalankan oleh layanan Auth.
grant execute on function public.handle_new_user_kategori() to supabase_auth_admin;
grant execute on function public.handle_new_user_kantong() to supabase_auth_admin;

-- 4. Sisa fitur Telegram (sudah dihapus dari aplikasi): nomor HP di
--    profiles, chat_id, dan id pesan. Tidak dipakai lagi — dihapus
--    (prinsip data minimization; disetujui 22 Okt 2026).
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.telegram_updates;
drop table if exists public.telegram_links;
drop table if exists public.profiles;
drop function if exists public.normalize_phone(text);
