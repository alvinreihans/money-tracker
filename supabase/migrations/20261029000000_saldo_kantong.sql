-- =============================================================
-- Migration: saldo kantong dihitung di database
--
-- Sebelumnya Beranda, Lend & Borrow, dan Pengaturan → Kantong mengunduh
-- semua transaksi terkonfirmasi sejak awal lalu menjumlahnya di aplikasi —
-- egress Supabase yang terus tumbuh dengan riwayat. Sekarang hanya
-- (id, saldo) per kantong yang dikirim.
--
-- Aturannya sama dengan hitungSaldo (src/lib/kantong.ts), yang tetap
-- dipakai cron notifikasi: pemasukan menambah kantong, pengeluaran
-- mengurangi, pindah kantong mengurangi asal & menambah tujuan; hanya
-- transaksi terkonfirmasi bertanggal >= saldo_per kantongnya.
-- =============================================================

-- Security invoker: lewat view transactions & RLS user_accounts, jadi hanya
-- kantong & transaksi milik pemanggil. Tidak menyentuh kolom terenkripsi.
create or replace function public.saldo_kantong()
returns table (id uuid, saldo numeric)
language sql
stable
set search_path = ''
as $$
  select
    k.id,
    k.saldo_awal + coalesce(sum(
      case when t.kantong_id = k.id then
        case t.type when 'income' then t.amount when 'expense' then -t.amount when 'transfer' then -t.amount else 0 end
      else 0 end
      + case when t.kantong_tujuan_id = k.id and t.type = 'transfer' then t.amount else 0 end
    ), 0)
  from public.user_accounts k
  left join public.transactions t
    on (t.kantong_id = k.id or t.kantong_tujuan_id = k.id)
   and t.status = 'confirmed'
   and t.transaction_date >= k.saldo_per
  where k.user_id = auth.uid()
  group by k.id, k.saldo_awal;
$$;

revoke execute on function public.saldo_kantong() from public, anon;
grant execute on function public.saldo_kantong() to authenticated;

notify pgrst, 'reload schema';
