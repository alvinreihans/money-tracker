-- =============================================================
-- Migration: init transactions
-- Expense Tracker Serverless (Supabase / PostgreSQL)
-- =============================================================

-- 1. ENUM untuk tipe transaksi (income / expense)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type public.transaction_type as enum ('income', 'expense');
  end if;
end$$;

-- 2. Tabel utama
create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  amount            numeric(14, 2) not null check (amount >= 0),
  type              public.transaction_type not null default 'expense',
  category          text not null default 'uncategorized',
  merchant          text,
  description       text,
  transaction_date  date not null default current_date,
  created_at        timestamptz not null default now()
);

-- 3. Index untuk query analitik (filter per user + rentang tanggal)
create index if not exists idx_transactions_user_date
  on public.transactions (user_id, transaction_date desc);

create index if not exists idx_transactions_user_type_cat
  on public.transactions (user_id, type, category);

-- 4. Row Level Security: tiap user hanya boleh akses datanya sendiri
alter table public.transactions enable row level security;

-- Grant level-tabel untuk role authenticated (RLS tetap memfilter baris).
-- Sengaja TIDAK memberi akses ke role anon => wajib login.
grant select, insert, update, delete on public.transactions to authenticated;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions for select
  using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
  on public.transactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 5. RPC: Rata-rata pengeluaran bulanan per kategori (3 bulan terakhir)
-- =============================================================
-- Logika:
--   * Hanya transaksi type = 'expense'.
--   * Rentang: 3 bulan kalender penuh terakhir (tidak termasuk bulan berjalan
--     agar rata-rata tidak bias oleh bulan yang belum selesai).
--   * Jumlahkan per (kategori, bulan), lalu rata-ratakan antar-bulan.
-- SECURITY INVOKER (default) => RLS tetap berlaku, aman multi-tenant.

create or replace function public.get_avg_monthly_expense_by_category()
returns table (
  category         text,
  avg_monthly      numeric,
  total_3m         numeric,
  months_active    int
)
language sql
stable
security invoker
set search_path = public
as $$
  with monthly as (
    select
      t.category,
      date_trunc('month', t.transaction_date) as month_bucket,
      sum(t.amount) as monthly_total
    from public.transactions t
    where t.user_id = auth.uid()
      and t.type = 'expense'
      and t.transaction_date >= (date_trunc('month', current_date) - interval '3 months')
      and t.transaction_date <  date_trunc('month', current_date)
    group by t.category, date_trunc('month', t.transaction_date)
  )
  select
    m.category,
    round(avg(m.monthly_total), 2)          as avg_monthly,
    round(sum(m.monthly_total), 2)          as total_3m,
    count(*)::int                           as months_active
  from monthly m
  group by m.category
  order by avg_monthly desc;
$$;

-- Beri akses eksekusi ke user terautentikasi
grant execute on function public.get_avg_monthly_expense_by_category() to authenticated;
