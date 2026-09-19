-- =============================================================
-- Migration: rekening koran, tipe transfer, dan deduplikasi lintas sumber
-- =============================================================

-- 1. Tipe transaksi: enum -> text + CHECK.
--    Alasan: `alter type ... add value` tidak boleh dipakai di transaksi yang
--    sama dengan pemakaiannya, sedangkan migration runner kita membungkus tiap
--    file dalam satu transaksi. text + CHECK juga lebih mudah dikembangkan.
alter table public.transactions
  alter column type type text using type::text;

alter table public.transactions
  alter column type set default 'expense';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_type_check'
  ) then
    alter table public.transactions
      add constraint transactions_type_check
      check (type in ('income', 'expense', 'transfer'));
  end if;
end$$;

-- 2. Kolom baru untuk melacak asal dan konteks transaksi.
alter table public.transactions
  -- rekening/dompet tempat uang bergerak, mis. "SeaBank", "ShopeePay"
  add column if not exists account text,
  -- lawan transaksi menurut rekening koran, mis. "ShopeePay", "Bunga Tabungan"
  add column if not exists counterparty text,
  -- receipt | payment_proof | statement | text
  add column if not exists source text not null default 'receipt',
  -- kunci idempoten untuk baris rekening koran (lihat catatan di bawah)
  add column if not exists external_id text;

-- Impor ulang rekening koran yang sama tidak boleh menggandakan baris.
create unique index if not exists idx_transactions_external
  on public.transactions (user_id, external_id)
  where external_id is not null;

-- Pencarian kandidat duplikat saat mengimpor statement (nominal + tanggal).
create index if not exists idx_transactions_dedupe
  on public.transactions (user_id, amount, transaction_date);

-- =============================================================
-- 3. Rekening & dompet milik user
-- =============================================================
-- Tanpa daftar ini mustahil membedakan "transfer ke ShopeePay" (pindah kantong
-- sendiri, bukan pengeluaran) dari "transfer ke Budi" (pengeluaran sungguhan).
create table if not exists public.user_accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  kind       text not null default 'bank' check (kind in ('bank', 'ewallet', 'cash')),
  -- nama lain yang muncul di rekening koran, mis. {"Shopee","SPay"}
  aliases    text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.user_accounts enable row level security;
grant select, insert, update, delete on public.user_accounts to authenticated;

drop policy if exists "user_accounts_own" on public.user_accounts;
create policy "user_accounts_own"
  on public.user_accounts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =============================================================
-- 4. RPC: transfer tidak boleh masuk hitungan pengeluaran
-- =============================================================
-- Topup ShopeePay dari BRImo bukan pengeluaran — uang hanya pindah kantong.
-- Filter `type = 'expense'` sudah mengecualikannya, tapi dinyatakan eksplisit
-- di sini agar maksudnya terbaca saat migrasi ini dibaca ulang nanti.
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
      and t.type = 'expense'          -- transfer & income dikecualikan
      and t.status = 'confirmed'
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

grant execute on function public.get_avg_monthly_expense_by_category() to authenticated;
