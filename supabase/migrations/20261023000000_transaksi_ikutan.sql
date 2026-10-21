-- =============================================================
-- Migration: transaksi ikutan (biaya admin pindah kantong, cashback belanja)
-- =============================================================
-- Biaya admin dicatat sebagai pengeluaran dan cashback sebagai pemasukan,
-- masing-masing baris sendiri yang menunjuk induknya. Dengan begitu semua
-- hitungan (ringkasan, budget, grafik, saldo kantong) ikut tanpa diubah, dan
-- menghapus induk ikut menghapus ikutannya.
alter table public.transactions
  add column if not exists induk_id uuid references public.transactions (id) on delete cascade;

create index if not exists idx_transactions_induk
  on public.transactions (induk_id)
  where induk_id is not null;
