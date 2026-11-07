-- Hasil evaluasi deposito bisa diurungkan (docs/specs/SPEC-perbaikan-uiux.md #3).
--
-- tutup_periode_deposito sekarang mencatat transaksi yang dibuatnya (bunga
-- masuk, pindah sisa saldo ke induk) di periode itu, supaya
-- urungkan_tutup_periode bisa membatalkannya persis: transaksi itu dihapus,
-- periode berikutnya (perpanjangan) dihapus selama belum dicek, deposito
-- berjalan lagi, dan periodenya kembali menunggu dicek.

alter table public.deposito_periode add column if not exists transaksi_tutup uuid[];
grant update (transaksi_tutup) on public.deposito_periode to authenticated;

-- Sama dengan 20261111000000_simpanan.sql, ditambah pencatatan transaksi_tutup.
create or replace function public.tutup_periode_deposito(p_periode uuid, p_bunga numeric, p_cair boolean, p_keterangan text, p_baru jsonb default null)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  p public.deposito_periode;
  d public.deposito;
  k public.user_accounts;
  sekarang timestamptz := now();
  tanggal date := (now() at time zone 'Asia/Jakarta')::date;
  jam time := (now() at time zone 'Asia/Jakarta')::time;
  kategori text;
  sisa numeric := 0;
  dibuat uuid[] := '{}';
  baru uuid;
begin
  select * into p from public.deposito_periode where id = p_periode for update;
  if not found then
    raise exception 'Periode deposito tidak ditemukan' using errcode = 'P0002';
  end if;
  select * into d from public.deposito where kantong_id = p.deposito_id for update;
  select * into k from public.user_accounts where id = d.kantong_id;
  if d.selesai or p.bunga_diterima is not null or p.dicairkan_awal then
    raise exception 'Periode ini sudah dicek' using errcode = '22023';
  end if;
  if exists (select 1 from public.deposito_periode x where x.deposito_id = d.kantong_id and x.ke > p.ke) then
    raise exception 'Bukan periode terakhir' using errcode = '22023';
  end if;
  if coalesce(p_bunga, -1) < 0 then
    raise exception 'Bunga yang diterima tidak boleh minus' using errcode = '22023';
  end if;
  if not p_cair and (p.jatuh_tempo > tanggal or d.perpanjangan = 'sekali' or p_baru is null) then
    raise exception 'Deposito ini belum bisa diperpanjang' using errcode = '22023';
  end if;

  if p_bunga > 0 then
    kategori := case when exists (select 1 from public.categories c where c.user_id = auth.uid() and c.type = 'income' and c.slug = 'investment')
                     then 'investment' else 'other' end;
    insert into public.transactions (user_id, amount, type, category, merchant, description, transaction_date, waktu,
                                     payment_method, kantong_id, status, source)
    values (auth.uid(), p_bunga, 'income', kategori, k.name, nullif(btrim(p_keterangan), ''), tanggal, jam,
            case when not p_cair and d.perpanjangan = 'pokok_bunga' then k.name
                 else (select i.name from public.user_accounts i where i.id = k.induk_id) end,
            case when not p_cair and d.perpanjangan = 'pokok_bunga' then k.id else k.induk_id end,
            'confirmed', 'text')
    returning id into baru;
    dibuat := dibuat || baru;
  end if;

  if p_cair then
    select s.saldo into sisa from public.saldo_kantong() s where s.id = k.id;
    if coalesce(sisa, 0) > 0 then
      insert into public.transactions (user_id, amount, type, merchant, transaction_date, waktu, payment_method,
                                       kantong_id, kantong_tujuan_id, status, source)
      values (auth.uid(), sisa, 'transfer', k.name, tanggal, jam, k.name, k.id, k.induk_id, 'confirmed', 'text')
      returning id into baru;
      dibuat := dibuat || baru;
    end if;
    update public.deposito set selesai = true where kantong_id = d.kantong_id;
  else
    insert into public.deposito_periode (user_id, deposito_id, ke, mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih)
    values (auth.uid(), d.kantong_id, p.ke + 1, (p_baru ->> 'mulai')::date, (p_baru ->> 'jatuh_tempo')::date,
            (p_baru ->> 'pokok')::numeric, (p_baru ->> 'bunga_kotor')::numeric, (p_baru ->> 'pajak')::numeric,
            (p_baru ->> 'bunga_bersih')::numeric);
  end if;

  update public.deposito_periode set
    bunga_diterima = p_bunga,
    dievaluasi_pada = sekarang,
    dicairkan_awal = p_cair and tanggal < p.jatuh_tempo,
    transaksi_tutup = dibuat
  where id = p.id;
  return coalesce(sisa, 0);
end;
$$;

-- Urungkan hasil evaluasi/pencairan satu periode. Hanya periode yang ditutup
-- lewat fungsi di atas (transaksi_tutup terisi), dan hanya selama periode
-- perpanjangannya belum dicek.
create or replace function public.urungkan_tutup_periode(p_periode uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  p public.deposito_periode;
begin
  select * into p from public.deposito_periode where id = p_periode for update;
  if not found then
    raise exception 'Periode deposito tidak ditemukan' using errcode = 'P0002';
  end if;
  if p.transaksi_tutup is null or (p.bunga_diterima is null and not p.dicairkan_awal) then
    raise exception 'Periode ini tidak bisa diurungkan' using errcode = '22023';
  end if;
  if exists (select 1 from public.deposito_periode x where x.deposito_id = p.deposito_id and x.ke > p.ke
             and (x.bunga_diterima is not null or x.dicairkan_awal or x.ke > p.ke + 1)) then
    raise exception 'Periode sesudahnya sudah dicek' using errcode = '22023';
  end if;

  delete from public.transactions where id = any(p.transaksi_tutup);
  delete from public.deposito_periode where deposito_id = p.deposito_id and ke = p.ke + 1;
  update public.deposito set selesai = false where kantong_id = p.deposito_id;
  update public.deposito_periode set
    bunga_diterima = null,
    dievaluasi_pada = null,
    dicairkan_awal = false,
    transaksi_tutup = null
  where id = p.id;
end;
$$;

revoke execute on function public.urungkan_tutup_periode(uuid) from public, anon;
grant execute on function public.urungkan_tutup_periode(uuid) to authenticated;
