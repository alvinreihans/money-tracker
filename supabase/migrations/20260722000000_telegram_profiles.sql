-- =============================================================
-- Migration: profiles, telegram_links, payment_method
-- Menambah dukungan bot Telegram multi-user (linking via nomor telepon)
-- =============================================================

-- 1. Kolom metode pembayaran di transactions
alter table public.transactions
  add column if not exists payment_method text;

-- 2. Normalisasi nomor telepon ke format kanonik (asumsi Indonesia).
--    "08123..." / "+62812..." / "8123..." / "62812..." => "62812..."
create or replace function public.normalize_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if raw is null then
    return null;
  end if;
  d := regexp_replace(raw, '\D', '', 'g'); -- ambil digit saja
  if d = '' then
    return null;
  end if;
  if left(d, 1) = '0' then
    d := '62' || substr(d, 2);
  elsif left(d, 1) = '8' then
    d := '62' || d;
  end if;
  return d;
end;
$$;

-- 3. Tabel profil user: menyimpan nomor telepon (dinormalisasi & unik).
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  phone      text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Trigger: otomatis buat profil saat user baru daftar.
--    Nomor diambil dari metadata signup (options.data.phone).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, phone)
  values (new.id, public.normalize_phone(new.raw_user_meta_data ->> 'phone'))
  on conflict (user_id) do update
    set phone = excluded.phone
    where public.profiles.phone is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Tabel penghubung chat Telegram -> akun user.
--    Hanya diakses oleh service role (webhook), jadi tanpa policy anon/authenticated.
create table if not exists public.telegram_links (
  chat_id    bigint primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.telegram_links enable row level security;
-- Tidak ada policy => role anon/authenticated tidak bisa akses.
-- service_role otomatis bypass RLS.
