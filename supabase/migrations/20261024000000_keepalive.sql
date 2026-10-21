-- =============================================================
-- Migration: keepalive untuk Vercel Cron (api/cron/keepalive)
-- =============================================================
-- Supabase free tier mem-pause project yang lama tidak dipakai. Cron harian
-- memanggil fungsi ini lewat anon key: query sungguhan ke Postgres, tanpa
-- membuka akses anon ke tabel mana pun.
create or replace function public.keepalive()
returns boolean
language sql
stable
security invoker
as $$
  select true;
$$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
