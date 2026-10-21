-- =============================================================
-- Migration: target budget bulanan per kategori (SPEC-analitik.md, modul budget)
-- =============================================================
-- Satu baris per kategori; targetnya sama tiap bulan. Menghapus target =
-- menghapus barisnya, jadi amount selalu > 0.
create table if not exists public.budgets (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category   text not null,
  amount     numeric(14, 2) not null check (amount > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.budgets enable row level security;
grant select, insert, update, delete on public.budgets to authenticated;

drop policy if exists "budgets_own" on public.budgets;
create policy "budgets_own"
  on public.budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
