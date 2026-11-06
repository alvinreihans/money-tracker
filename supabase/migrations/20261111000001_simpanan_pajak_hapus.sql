-- Simpanan, lanjutan (docs/specs/SPEC-simpanan.md §2, §6).

-- 1. Pajak bawaan mengikuti pokok tiap periode (20%, 0% bila pokok ≤ Rp 7,5 jt),
--    sampai user mengubahnya sendiri: pajak_otomatis = false, pajak_persen tetap.
alter table public.deposito add column if not exists pajak_otomatis boolean not null default true;
grant insert (pajak_otomatis), update (pajak_otomatis) on public.deposito to authenticated;

-- buat_simpanan: sama dengan 20261111000000_simpanan.sql, ditambah pajak_otomatis.
create or replace function public.buat_simpanan(p_kantong jsonb, p_termasuk boolean, p_deposito jsonb default null, p_periode jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saldo numeric := coalesce((p_kantong ->> 'saldo')::numeric, 0);
  macam text := p_kantong ->> 'macam_simpanan';
  induk public.user_accounts;
  baru uuid;
  sekarang timestamptz := now();
  tanggal date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if saldo < 0 then
    raise exception 'Saldo simpanan tidak boleh minus' using errcode = '22023';
  end if;
  if macam = 'deposito' and (saldo <= 0 or p_deposito is null or p_periode is null) then
    raise exception 'Deposito butuh pokok, bunga, dan tenor' using errcode = '22023';
  end if;
  select * into induk from public.user_accounts where id = (p_kantong ->> 'induk_id')::uuid and user_id = auth.uid();
  if not found then
    raise exception 'Kantong induk tidak ditemukan' using errcode = 'P0002';
  end if;

  insert into public.user_accounts (user_id, name, emoji, kind, induk_id, macam_simpanan, saldo_awal, saldo_per, saldo_sejak)
  values (auth.uid(), p_kantong ->> 'name', p_kantong ->> 'emoji', 'simpanan', induk.id, macam,
          case when p_termasuk then 0 else saldo end, tanggal, date_trunc('minute', sekarang))
  returning id into baru;

  if macam = 'deposito' then
    insert into public.deposito (kantong_id, user_id, bunga_persen, tenor, satuan_tenor, pajak_persen, pajak_otomatis, perpanjangan)
    values (baru, auth.uid(), (p_deposito ->> 'bunga_persen')::numeric, (p_deposito ->> 'tenor')::int,
            p_deposito ->> 'satuan_tenor', (p_deposito ->> 'pajak_persen')::numeric,
            coalesce((p_deposito ->> 'pajak_otomatis')::boolean, true), p_deposito ->> 'perpanjangan');
    insert into public.deposito_periode (user_id, deposito_id, ke, mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih)
    values (auth.uid(), baru, 1, (p_periode ->> 'mulai')::date, (p_periode ->> 'jatuh_tempo')::date, saldo,
            (p_periode ->> 'bunga_kotor')::numeric, (p_periode ->> 'pajak')::numeric, (p_periode ->> 'bunga_bersih')::numeric);
  end if;

  if p_termasuk and saldo > 0 then
    insert into public.transactions (user_id, amount, type, merchant, transaction_date, waktu, payment_method,
                                     kantong_id, kantong_tujuan_id, status, source)
    values (auth.uid(), saldo, 'transfer', p_kantong ->> 'name', tanggal, (sekarang at time zone 'Asia/Jakarta')::time,
            induk.name, induk.id, baru, 'confirmed', 'text');
  end if;
  return baru;
end;
$$;

-- 2. Hapus deposito yang masih berjalan = Cairkan sekarang lalu hapus: bunga
--    bersih yang diterima (bawaan 0) dicatat sebagai pemasukan ke induk bila
--    > 0, saldo kembali ke induk, lalu kantongnya dihapus.
drop function if exists public.hapus_simpanan(uuid);
create or replace function public.hapus_simpanan(p_id uuid, p_bunga numeric default 0, p_keterangan text default null)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  k public.user_accounts;
  sisa numeric;
  tanggal date := (now() at time zone 'Asia/Jakarta')::date;
  jam time := (now() at time zone 'Asia/Jakarta')::time;
begin
  select * into k from public.user_accounts where id = p_id and user_id = auth.uid() and kind = 'simpanan' for update;
  if not found then
    raise exception 'Simpanan tidak ditemukan' using errcode = 'P0002';
  end if;
  if coalesce(p_bunga, -1) < 0 then
    raise exception 'Bunga yang diterima tidak boleh minus' using errcode = '22023';
  end if;
  if p_bunga > 0 then
    insert into public.transactions (user_id, amount, type, category, merchant, description, transaction_date, waktu,
                                     payment_method, kantong_id, status, source)
    values (auth.uid(), p_bunga, 'income',
            case when exists (select 1 from public.categories c where c.user_id = auth.uid() and c.type = 'income' and c.slug = 'investment')
                 then 'investment' else 'other' end,
            k.name, nullif(btrim(p_keterangan), ''), tanggal, jam,
            (select i.name from public.user_accounts i where i.id = k.induk_id), k.induk_id, 'confirmed', 'text');
  end if;
  select s.saldo into sisa from public.saldo_kantong() s where s.id = k.id;
  if coalesce(sisa, 0) > 0 then
    insert into public.transactions (user_id, amount, type, merchant, transaction_date, waktu, payment_method,
                                     kantong_id, kantong_tujuan_id, status, source)
    values (auth.uid(), sisa, 'transfer', k.name, tanggal, jam, k.name, k.id, k.induk_id, 'confirmed', 'text');
  end if;
  delete from public.user_accounts where id = k.id;
  return coalesce(sisa, 0);
end;
$$;
revoke execute on function public.hapus_simpanan(uuid, numeric, text) from public, anon;
grant execute on function public.hapus_simpanan(uuid, numeric, text) to authenticated;

notify pgrst, 'reload schema';
