-- Saldo per jam (SPEC-saldo-waktu): jam transaksi tersimpan per menit ("18:52"),
-- saldo_sejak sampai detik (18:52:41). Bandingkan per menit, sama seperti
-- hitungSaldo di aplikasi; tanpa ini transaksi yang dicatat di menit yang sama
-- dengan saldo diisi tidak ikut memotong.

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
   and (
     t.transaction_date > k.saldo_per
     or (t.transaction_date = k.saldo_per
         and (t.waktu is null or t.waktu >= date_trunc('minute', k.saldo_sejak at time zone 'Asia/Jakarta')::time))
   )
  where k.user_id = auth.uid()
  group by k.id, k.saldo_awal;
$$;
revoke execute on function public.saldo_kantong() from public, anon;
grant execute on function public.saldo_kantong() to authenticated;
