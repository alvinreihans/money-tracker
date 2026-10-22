-- =============================================================
-- Migration: push notifikasi (SPEC-notifikasi.md, disetujui 22 Okt 2026)
-- =============================================================

-- 1. Langganan push per perangkat. Unik per (user, endpoint): satu HP yang
--    dipakai dua akun menerima notifikasi keduanya.
create table if not exists public.push_langganan (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null check (endpoint like 'https://%'),
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_langganan enable row level security;
revoke all on public.push_langganan from anon, authenticated, service_role;
-- Tanpa UPDATE: endpoint yang sama selalu berkunci sama, jadi daftar ulang
-- cukup insert yang mengabaikan duplikat.
grant select, insert, delete on public.push_langganan to authenticated;
-- Cron menghapus langganan yang sudah tidak berlaku (404/410 dari server
-- push); SELECT dibutuhkan untuk filter WHERE-nya.
grant select, delete on public.push_langganan to service_role;

drop policy if exists "push_langganan_own" on public.push_langganan;
create policy "push_langganan_own"
  on public.push_langganan for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Data untuk cron notifikasi harian. Cron tidak login sebagai siapa pun,
--    sedangkan view transactions hanya menampilkan baris auth.uid(); fungsi
--    ini membaca tabelnya langsung, hanya kolom non-teks (tidak ada yang
--    didekripsi), hanya untuk user yang berlangganan. Hanya service_role.
create or replace function public.data_notifikasi()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.user_id,
    'langganan', (
      select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
      from public.push_langganan p where p.user_id = u.user_id
    ),
    'kantong', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'kind', k.kind, 'saldo_awal', k.saldo_awal,
        'saldo_per', k.saldo_per, 'jatuh_tempo', k.jatuh_tempo)), '[]')
      from public.user_accounts k where k.user_id = u.user_id and k.kind in ('orang', 'kredit')
    ),
    'cicilan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'nama', c.nama, 'nominal', c.nominal, 'tenor', c.tenor,
        'jatuh_tempo_awal', c.jatuh_tempo_awal)), '[]')
      from public.cicilan c where c.user_id = u.user_id
    ),
    -- Yang dibutuhkan saja: saldo orang/kartu, cicilan terbayar, dan apakah
    -- sudah ada yang dicatat hari ini.
    'transaksi', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'amount', t.amount, 'type', t.type, 'transaction_date', t.transaction_date,
        'created_at', t.created_at, 'kantong_id', t.kantong_id,
        'kantong_tujuan_id', t.kantong_tujuan_id, 'cicilan_id', t.cicilan_id,
        'cicilan_ke', t.cicilan_ke)), '[]')
      from private.transaksi_data t
      where t.user_id = u.user_id
        and (t.cicilan_id is not null
          or t.created_at > now() - interval '2 days'
          or exists (
            select 1 from public.user_accounts k
            where k.id in (t.kantong_id, t.kantong_tujuan_id) and k.kind in ('orang', 'kredit')))
    )
  )), '[]')
  from (select distinct user_id from public.push_langganan) u;
$$;

-- Bawaan Supabase memberi EXECUTE fungsi baru di public ke anon & authenticated.
revoke execute on function public.data_notifikasi() from public, anon, authenticated;
grant execute on function public.data_notifikasi() to service_role;

notify pgrst, 'reload schema';
