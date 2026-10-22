-- =============================================================
-- Migration: Lend & Borrow, cicilan (SPEC-lend-borrow.md)
-- =============================================================

-- 1. Jenis kantong baru.
--    orang  : satu orang yang terlibat pinjaman. Saldo positif = Lend (dia
--             utang ke aku), negatif = Borrow (aku utang ke dia).
--    kredit : kartu kredit. Saldo negatif = tagihan berjalan.
--    Pinjaman dicatat sebagai pindah kantong, jadi tidak masuk pemasukan,
--    pengeluaran, budget, maupun grafik.
alter table public.user_accounts drop constraint if exists user_accounts_kind_check;
alter table public.user_accounts
  add constraint user_accounts_kind_check
  check (kind in ('bank', 'ewallet', 'cash', 'orang', 'kredit'));

-- Jatuh tempo (opsional) untuk pinjaman ke/dari orang.
alter table public.user_accounts add column if not exists jatuh_tempo date;

-- Kantong orang & kredit dibuat dari aplikasi, jadi jenisnya boleh diisi saat
-- membuat. Kolom bawaan tetap tidak bisa diatur dari aplikasi.
grant insert (kind, jatuh_tempo) on public.user_accounts to authenticated;
grant update (jatuh_tempo) on public.user_accounts to authenticated;

-- 2. Rencana cicilan (paylater, cicilan kartu kredit). Belanjanya tidak
--    dicatat sebagai pengeluaran; tiap cicilan yang dibayar menjadi
--    pengeluaran biasa yang menempel ke rencananya. Jadwal dihitung dari
--    jatuh_tempo_awal + bulan ke-n, tidak disimpan.
create table if not exists public.cicilan (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nama             text not null check (char_length(btrim(nama)) between 1 and 60),
  penyedia         text check (penyedia is null or char_length(penyedia) <= 60),
  category         text not null default 'other',
  nominal          numeric(14, 2) not null check (nominal > 0),
  tenor            int not null check (tenor between 1 and 120),
  jatuh_tempo_awal date not null,
  -- Kantong pembayar bawaan (bank/e-wallet, atau kartu kredit untuk cicilan kartu).
  kantong_id       uuid references public.user_accounts (id) on delete set null,
  catatan          text check (catatan is null or char_length(catatan) <= 500),
  created_at       timestamptz not null default now()
);

alter table public.cicilan enable row level security;
grant select, insert, update, delete on public.cicilan to authenticated;

drop policy if exists "cicilan_own" on public.cicilan;
create policy "cicilan_own"
  on public.cicilan for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Pembayaran cicilan = transaksi pengeluaran yang menempel ke rencananya.
alter table public.transactions
  add column if not exists cicilan_id uuid references public.cicilan (id) on delete set null,
  add column if not exists cicilan_ke int check (cicilan_ke is null or cicilan_ke >= 1);

create index if not exists idx_transactions_cicilan
  on public.transactions (cicilan_id)
  where cicilan_id is not null;
