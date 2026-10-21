-- =============================================================
-- Migration: kantong — saldo awal & transaksi tertaut (SPEC-analitik.md, modul kantong)
-- =============================================================
-- Kantong memakai ulang tabel user_accounts. saldo_awal adalah saldo di AWAL
-- tanggal saldo_per; transaksi bertanggal itu dan sesudahnya ikut dihitung.
alter table public.user_accounts
  add column if not exists saldo_awal numeric(14, 2) not null default 0,
  add column if not exists saldo_per  date not null default current_date;

-- kantong_id: tempat uang keluar/masuk (untuk pindah kantong: asalnya).
-- kantong_tujuan_id: hanya untuk pindah kantong. Kantong dihapus → transaksi
-- tetap ada, cuma lepas tautannya. payment_method tetap menyimpan teks asli.
alter table public.transactions
  add column if not exists kantong_id        uuid references public.user_accounts (id) on delete set null,
  add column if not exists kantong_tujuan_id uuid references public.user_accounts (id) on delete set null;

-- Backfill sekali: cocokkan teks lama ke nama/alias kantong, tanpa membedakan
-- huruf besar-kecil, spasi, dan tanda baca — aturan yang sama dengan
-- cocokkanKantong di src/lib/kantong.ts (minus alias bawaan di kode).
-- Baris rekening koran menyimpan rekeningnya di `account`, jadi itu didahulukan.
update public.transactions t
set kantong_id = a.id
from public.user_accounts a
where t.kantong_id is null
  and a.user_id = t.user_id
  and regexp_replace(lower(coalesce(t.account, t.payment_method, '')), '[^a-z0-9]', '', 'g') <> ''
  and (
    regexp_replace(lower(a.name), '[^a-z0-9]', '', 'g')
      = regexp_replace(lower(coalesce(t.account, t.payment_method)), '[^a-z0-9]', '', 'g')
    or exists (
      select 1 from unnest(a.aliases) al
      where regexp_replace(lower(al), '[^a-z0-9]', '', 'g')
        = regexp_replace(lower(coalesce(t.account, t.payment_method)), '[^a-z0-9]', '', 'g')
    )
  );

-- Pindah kantong dari rekening koran: tujuannya tercatat di `counterparty`.
update public.transactions t
set kantong_tujuan_id = a.id
from public.user_accounts a
where t.type = 'transfer'
  and t.kantong_tujuan_id is null
  and t.counterparty is not null
  and a.user_id = t.user_id
  and (
    regexp_replace(lower(a.name), '[^a-z0-9]', '', 'g')
      = regexp_replace(lower(t.counterparty), '[^a-z0-9]', '', 'g')
    or exists (
      select 1 from unnest(a.aliases) al
      where regexp_replace(lower(al), '[^a-z0-9]', '', 'g')
        = regexp_replace(lower(t.counterparty), '[^a-z0-9]', '', 'g')
    )
  );
