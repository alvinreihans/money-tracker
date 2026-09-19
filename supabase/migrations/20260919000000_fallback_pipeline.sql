-- =============================================================
-- Migration: fallback pipeline
-- Mendukung pipeline Tesseract -> Groq -> Gemini Vision (lihat FALLBACK.md)
-- =============================================================

-- 1. Status transaksi.
--    'confirmed'    = ekstraksi berhasil & lolos validasi
--    'needs_review' = semua jalur gagal, disimpan agar user bisa koreksi manual
alter table public.transactions
  add column if not exists status text not null default 'confirmed';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_status_check'
  ) then
    alter table public.transactions
      add constraint transactions_status_check
      check (status in ('confirmed', 'needs_review'));
  end if;
end$$;

-- 2. Teks OCR mentah, hanya diisi saat status = 'needs_review'.
--    Tanpa ini, struk yang gagal dibaca hilang begitu saja dan user harus
--    memfoto ulang.
alter table public.transactions
  add column if not exists raw_ocr_text text;

-- 3. Index untuk menampilkan antrean koreksi manual.
create index if not exists idx_transactions_needs_review
  on public.transactions (user_id, created_at desc)
  where status = 'needs_review';

-- =============================================================
-- 4. Dedupe update Telegram
-- =============================================================
-- Telegram mengirim ulang update bila webhook tidak membalas cepat. Karena
-- pipeline OCR memakan beberapa detik, retry justru makin mungkin terjadi.
-- Tanpa tabel ini, satu struk bisa tersimpan dua kali.
create table if not exists public.telegram_updates (
  update_id  bigint primary key,
  chat_id    bigint not null,
  created_at timestamptz not null default now()
);

alter table public.telegram_updates enable row level security;
-- Tidak ada policy => hanya service role (webhook) yang bisa mengakses.

-- Untuk pembersihan berkala baris lama (tabel ini tumbuh terus).
create index if not exists idx_telegram_updates_created
  on public.telegram_updates (created_at);

-- =============================================================
-- 5. RPC: kecualikan draft dari perhitungan rata-rata
-- =============================================================
-- Baris needs_review umumnya ber-amount 0 (ekstraksi gagal). Kalau ikut
-- dihitung, rata-rata per kategori jadi turun tanpa alasan yang benar.

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
