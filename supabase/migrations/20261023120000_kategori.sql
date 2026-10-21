-- =============================================================
-- Migration: kategori buatan user (SPEC-analitik.md, modul kategori)
-- =============================================================
-- Tiap user punya daftar kategori sendiri, diisi kategori bawaan saat daftar.
-- transactions.category & budgets.category tetap menyimpan `slug` (teks),
-- jadi data lama tidak perlu diubah. Bawaan memakai slug lama ("food", ...);
-- buatan user memakai slug acak ("c-…") yang tidak berubah walau diganti nama.
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type       text not null check (type in ('expense', 'income')),
  slug       text not null,
  name       text not null check (char_length(btrim(name)) between 1 and 30),
  icon       text not null,
  color      text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, type, slug)
);

create unique index if not exists idx_categories_nama
  on public.categories (user_id, type, lower(btrim(name)));

alter table public.categories enable row level security;
grant select, insert, update, delete on public.categories to authenticated;

drop policy if exists "categories_own" on public.categories;
drop policy if exists "categories_select" on public.categories;
drop policy if exists "categories_insert" on public.categories;
drop policy if exists "categories_update" on public.categories;
drop policy if exists "categories_delete" on public.categories;
create policy "categories_select" on public.categories for select using (auth.uid() = user_id);
create policy "categories_insert" on public.categories for insert with check (auth.uid() = user_id);
-- "Lainnya" (slug other) jadi tempat jatuh: boleh diganti nama/ikon, tapi
-- tidak boleh dihapus. (Aplikasi tidak pernah mengubah slug kategori apa pun.)
create policy "categories_update" on public.categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "categories_delete" on public.categories for delete
  using (auth.uid() = user_id and slug <> 'other');

-- Kategori bawaan. Sama dengan KATEGORI_BAWAAN di src/lib/kategori.ts.
create or replace function public.seed_kategori_bawaan(uid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.categories (user_id, type, slug, name, icon, color, sort)
  values
    (uid, 'expense', 'food',          'Makan',            'utensils',        '#ff9f43', 1),
    (uid, 'expense', 'groceries',     'Belanja harian',   'shopping-basket', '#5ecb7a', 2),
    (uid, 'expense', 'transport',     'Transportasi',     'car',             '#3e91ff', 3),
    (uid, 'expense', 'shopping',      'Belanja',          'shopping-bag',    '#ff7a9c', 4),
    (uid, 'expense', 'health',        'Kesehatan',        'heart-pulse',     '#ff5f5f', 5),
    (uid, 'expense', 'entertainment', 'Hiburan',          'clapperboard',    '#bf7af0', 6),
    (uid, 'expense', 'bills',         'Tagihan',          'receipt',         '#4fc9e0', 7),
    (uid, 'expense', 'fees',          'Biaya admin',      'coins',           '#8fa3bf', 8),
    (uid, 'expense', 'other',         'Lainnya',          'circle-ellipsis', '#9b9b9b', 99),
    (uid, 'income',  'salary',        'Gaji',             'briefcase',       '#5ecb7a', 1),
    (uid, 'income',  'bonus',         'Bonus/THR',        'sparkles',        '#5ecb7a', 2),
    (uid, 'income',  'business',      'Usaha/Jualan',     'store',           '#5ecb7a', 3),
    (uid, 'income',  'freelance',     'Freelance/Proyek', 'laptop',          '#5ecb7a', 4),
    (uid, 'income',  'gift',          'Pemberian',        'gift',            '#5ecb7a', 5),
    (uid, 'income',  'refund',        'Cashback/Refund',  'badge-percent',   '#5ecb7a', 6),
    (uid, 'income',  'investment',    'Bunga/Investasi',  'trending-up',     '#5ecb7a', 7),
    (uid, 'income',  'other',         'Lainnya',          'circle-ellipsis', '#9b9b9b', 99)
  on conflict do nothing;
$$;

-- User baru: langsung dapat kategori bawaan.
create or replace function public.handle_new_user_kategori()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_kategori_bawaan(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_kategori on auth.users;
create trigger on_auth_user_created_kategori
  after insert on auth.users
  for each row execute function public.handle_new_user_kategori();

-- User lama: isi sekarang.
select public.seed_kategori_bawaan(id) from auth.users;

-- Hapus kategori: transaksinya pindah ke "Lainnya" dan budget-nya ikut
-- dihapus, dalam satu transaksi database. Mengembalikan jumlah transaksi
-- yang dipindah. security invoker: RLS tetap berlaku.
create or replace function public.hapus_kategori(p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  k public.categories;
  pindah integer;
begin
  select * into k from public.categories where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'Kategori tidak ditemukan';
  end if;
  if k.slug = 'other' then
    raise exception 'Kategori Lainnya tidak bisa dihapus';
  end if;

  update public.transactions
    set category = 'other'
    where user_id = auth.uid() and type = k.type and category = k.slug;
  get diagnostics pindah = row_count;

  if k.type = 'expense' then
    delete from public.budgets where user_id = auth.uid() and category = k.slug;
  end if;

  delete from public.categories where id = k.id;
  return pindah;
end;
$$;

grant execute on function public.hapus_kategori(uuid) to authenticated;
revoke execute on function public.seed_kategori_bawaan(uuid) from public, anon, authenticated;
