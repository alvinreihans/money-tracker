-- Deposito jatuh tempo dari rekening koran (docs/specs/SPEC-deposito-jatuh-tempo.md):
-- satu kejadian jatuh tempo = satu catatan.
--
-- 1. deposito_periode.dari_rekening: periode ditutup dari baris rekening koran
--    (bukan evaluasi di aplikasi); detail deposito menawarkan Urungkan.
-- 2. user_accounts.macam_simpanan boleh diubah (K2: kantong Jago "Deposito" yang
--    sudah jadi simpanan tabungan dijadikan deposito saat impor).
-- 3. impor_rekening: sama dengan 20261113000000_lengkapi_urutan.sql, ditambah
--    - hapus[]: pengeluaran penempatan "Fund Placement" yang sudah diganti pindah
--      kantong pembuatan deposito "Sudah termasuk" (K3), sebelum tautkan (pengenal
--      barisnya pindah ke pindah kantong itu);
--    - jadikan[]: kantong simpanan tabungan → deposito, dengan periode ke-1 (K2);
--    - tutup[]: periode yang belum dicek ditutup dari rekening koran (§1), boleh
--      berantai (periode perpanjangan dari entri sebelumnya, lewat kuncinya);
--    - sesuaikan[]: periode yang sudah dievaluasi tapi bunganya beda dengan bank
--      (K1): transaksi bunga diubah ke nominal bank, periode berikutnya dihitung ulang.
-- 4. urungkan_tutup_periode: juga mengosongkan dari_rekening.
-- 5. ganti_penempatan / urungkan_ganti_penempatan (K3, saat deposito dibuat):
--    pengeluaran "Fund Placement" bertanggal & bernominal sama dengan penempatan
--    deposito "Sudah termasuk" dihapus; pindah kantong pembuatannya mengambil
--    tanggal, jam, dan pengenal baris pengeluaran itu. Bisa diurungkan.

alter table public.deposito_periode add column if not exists dari_rekening boolean not null default false;
grant update (dari_rekening) on public.deposito_periode to authenticated;

grant update (macam_simpanan) on public.user_accounts to authenticated;

create or replace function public.impor_rekening(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  peta jsonb := '{}'::jsonb;
  x jsonb;
  baru uuid;
  sekarang timestamptz := now();
  n_kantong int := 0;
  n_sisip int := 0;
  n_tautan int := 0;
  n_deposito int := 0;
  per public.deposito_periode;
  dibuat uuid[];
begin
  if auth.uid() is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;

  -- Kantong baru: bank dulu, lalu simpanan (induknya bisa kantong yang baru dibuat).
  for x in
    select value from jsonb_array_elements(coalesce(p -> 'kantong_baru', '[]'::jsonb))
    order by (value ->> 'kind') = 'simpanan'
  loop
    insert into public.user_accounts (user_id, name, emoji, kind, induk_id, macam_simpanan, saldo_awal, saldo_sejak, nomor_akhir)
    values (
      auth.uid(), x ->> 'name', x ->> 'emoji', x ->> 'kind',
      (coalesce(peta ->> (x ->> 'induk_id'), x ->> 'induk_id'))::uuid,
      nullif(x ->> 'macam_simpanan', ''),
      coalesce((x ->> 'saldo_awal')::numeric, 0),
      coalesce((x ->> 'saldo_sejak')::timestamptz, date_trunc('minute', sekarang)),
      nullif(x ->> 'nomor_akhir', '')
    )
    returning id into baru;
    peta := peta || jsonb_build_object(x ->> 'kunci', baru);
    n_kantong := n_kantong + 1;
  end loop;

  for x in select value from jsonb_array_elements(coalesce(p -> 'nomor_akhir', '[]'::jsonb)) loop
    update public.user_accounts set nomor_akhir = x ->> 'nomor_akhir' where id = (x ->> 'id')::uuid and user_id = auth.uid();
  end loop;

  -- Deposito yang ditawarkan & diterima: lewat buat_simpanan (uang baru, tidak
  -- diambil dari saldo induk — saldo rekening koran SeaBank tidak memuatnya).
  for x in select value from jsonb_array_elements(coalesce(p -> 'deposito_baru', '[]'::jsonb)) loop
    baru := public.buat_simpanan(
      jsonb_build_object('name', x ->> 'name', 'emoji', '💰', 'macam_simpanan', 'deposito', 'saldo', x -> 'pokok',
                         'induk_id', coalesce(peta ->> (x ->> 'induk_id'), x ->> 'induk_id')),
      false,
      jsonb_build_object('bunga_persen', x -> 'bunga_persen', 'tenor', x -> 'tenor', 'satuan_tenor', x ->> 'satuan_tenor',
                         'pajak_persen', x -> 'pajak_persen', 'perpanjangan', 'sekali'),
      jsonb_build_object('mulai', x ->> 'mulai', 'jatuh_tempo', x ->> 'jatuh_tempo', 'bunga_kotor', x -> 'bunga_kotor',
                         'pajak', x -> 'pajak', 'bunga_bersih', x -> 'bunga_bersih')
    );
    -- Penempatannya ada di rekening koran: saldo 0 sejak 00.00 WIB tanggal
    -- penempatan; pindah kantong penempatan itulah yang mengisinya.
    if x ->> 'didanai' is not null then
      update public.user_accounts
         set saldo_awal = 0, saldo_sejak = ((x ->> 'didanai')::date)::timestamp at time zone 'Asia/Jakarta'
       where id = baru and user_id = auth.uid();
    end if;
    peta := peta || jsonb_build_object(x ->> 'kunci', baru);
    n_kantong := n_kantong + 1;
  end loop;

  -- Kantong Jago "Deposito" (simpanan tabungan) dijadikan deposito (K2). Saldo &
  -- riwayat kantongnya tetap; periode ke-1 dari baris Penempatan Dana.
  for x in select value from jsonb_array_elements(coalesce(p -> 'jadikan', '[]'::jsonb)) loop
    baru := (coalesce(peta ->> (x ->> 'kantong_id'), x ->> 'kantong_id'))::uuid;
    update public.user_accounts set macam_simpanan = 'deposito'
     where id = baru and user_id = auth.uid() and kind = 'simpanan' and macam_simpanan = 'tabungan';
    if not found then
      raise exception 'Kantong ini tidak bisa dijadikan deposito' using errcode = '22023';
    end if;
    insert into public.deposito (kantong_id, user_id, bunga_persen, tenor, satuan_tenor, pajak_persen, pajak_otomatis, perpanjangan)
    values (baru, auth.uid(), (x ->> 'bunga_persen')::numeric, (x ->> 'tenor')::int, x ->> 'satuan_tenor',
            (x ->> 'pajak_persen')::numeric, true, x ->> 'perpanjangan');
    insert into public.deposito_periode (user_id, deposito_id, ke, mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih)
    values (auth.uid(), baru, 1, (x -> 'periode' ->> 'mulai')::date, (x -> 'periode' ->> 'jatuh_tempo')::date,
            (x -> 'periode' ->> 'pokok')::numeric, (x -> 'periode' ->> 'bunga_kotor')::numeric,
            (x -> 'periode' ->> 'pajak')::numeric, (x -> 'periode' ->> 'bunga_bersih')::numeric)
    returning id into baru;
    peta := peta || jsonb_build_object(x -> 'periode' ->> 'kunci', baru);
  end loop;

  -- Samakan saldo awal (K4).
  for x in select value from jsonb_array_elements(coalesce(p -> 'saldo', '[]'::jsonb)) loop
    update public.user_accounts
       set saldo_awal = (x ->> 'saldo_awal')::numeric, saldo_sejak = (x ->> 'saldo_sejak')::timestamptz
     where id = (coalesce(peta ->> (x ->> 'kantong_id'), x ->> 'kantong_id'))::uuid and user_id = auth.uid();
  end loop;

  begin
    -- Pengeluaran penempatan yang sudah diganti pindah kantong pembuatan deposito (K3).
    for x in select value from jsonb_array_elements(coalesce(p -> 'hapus', '[]'::jsonb)) loop
      delete from public.transactions
       where id = (x #>> '{}')::uuid and source = 'statement' and type = 'expense';
    end loop;

    -- Transaksi baru: induk dulu, lalu ikutannya (biaya transfer).
    for x in
      select e.value from jsonb_array_elements(coalesce(p -> 'sisip', '[]'::jsonb)) with ordinality as e(value, n)
      order by (e.value ->> 'induk') is not null, e.n
    loop
      insert into public.transactions (
        user_id, amount, type, category, merchant, description, transaction_date, waktu,
        kantong_id, kantong_tujuan_id, induk_id, status, source, ref_bank, ref_bank_tujuan, perlu_dilengkapi, created_at
      ) values (
        auth.uid(), (x ->> 'amount')::numeric, x ->> 'type', coalesce(x ->> 'category', 'other'),
        x ->> 'merchant', x ->> 'description', (x ->> 'transaction_date')::date, (x ->> 'waktu')::time,
        (coalesce(peta ->> (x ->> 'kantong_id'), x ->> 'kantong_id'))::uuid,
        (coalesce(peta ->> (x ->> 'kantong_tujuan_id'), x ->> 'kantong_tujuan_id'))::uuid,
        (peta ->> (x ->> 'induk'))::uuid,
        'confirmed', 'statement', x ->> 'ref_bank', x ->> 'ref_bank_tujuan', coalesce((x ->> 'perlu_dilengkapi')::boolean, false),
        sekarang + coalesce((x ->> 'urut')::int, 0) * interval '1 millisecond'
      )
      returning id into baru;
      peta := peta || jsonb_build_object(x ->> 'kunci', baru);
      n_sisip := n_sisip + 1;
    end loop;

    -- Baris yang sudah tercatat: transaksinya dipertahankan, hanya ditautkan.
    for x in select value from jsonb_array_elements(coalesce(p -> 'tautkan', '[]'::jsonb)) loop
      update public.transactions
         set ref_bank = coalesce(x ->> 'ref_bank', ref_bank),
             ref_bank_tujuan = coalesce(x ->> 'ref_bank_tujuan', ref_bank_tujuan)
       where id = (x ->> 'id')::uuid;
      n_tautan := n_tautan + 1;
    end loop;

    -- Bunga bulan yang sama dari rekening koran yang lebih lengkap.
    for x in select value from jsonb_array_elements(coalesce(p -> 'perbarui', '[]'::jsonb)) loop
      update public.transactions
         set amount = (x ->> 'amount')::numeric, description = x ->> 'description'
       where id = (x ->> 'id')::uuid and source = 'statement';
    end loop;
    -- Penempatan deposito yang dulu terimpor sebagai pengeluaran → pindah kantong.
    for x in select value from jsonb_array_elements(coalesce(p -> 'jadi_pindah', '[]'::jsonb)) loop
      update public.transactions
         set type = 'transfer', category = 'other', perlu_dilengkapi = false, merchant = x ->> 'merchant',
             kantong_tujuan_id = (coalesce(peta ->> (x ->> 'kantong_tujuan_id'), x ->> 'kantong_tujuan_id'))::uuid
       where id = (x ->> 'id')::uuid and source = 'statement' and type = 'expense';
    end loop;

    -- Periode yang belum dicek, ditutup dari rekening koran (urut: perpanjangan dari
    -- entri sebelumnya bisa ditutup oleh entri berikutnya).
    for x in select e.value from jsonb_array_elements(coalesce(p -> 'tutup', '[]'::jsonb)) with ordinality as e(value, n) order by e.n loop
      select * into per from public.deposito_periode
       where id = (coalesce(peta ->> (x ->> 'periode'), x ->> 'periode'))::uuid for update;
      if not found then
        raise exception 'Periode deposito tidak ditemukan' using errcode = 'P0002';
      end if;
      if per.bunga_diterima is not null or per.dicairkan_awal
         or exists (select 1 from public.deposito_periode z where z.deposito_id = per.deposito_id and z.ke > per.ke)
         or exists (select 1 from public.deposito d where d.kantong_id = per.deposito_id and d.selesai) then
        -- Sudah ditutup sejak pratinjau (evaluasi/impor lain): pesan "sudah diimpor barusan" di bawah.
        raise exception 'Periode deposito sudah dicek' using errcode = '23505';
      end if;
      if coalesce((x ->> 'bunga')::numeric, -1) < 0 then
        raise exception 'Bunga yang diterima tidak boleh minus' using errcode = '22023';
      end if;
      select coalesce(array_agg((coalesce(peta ->> v, v))::uuid), '{}') into dibuat
        from jsonb_array_elements_text(coalesce(x -> 'transaksi', '[]'::jsonb)) as v;
      if coalesce((x ->> 'cair')::boolean, false) then
        update public.deposito set selesai = true where kantong_id = per.deposito_id;
      else
        if x -> 'baru' is null or jsonb_typeof(x -> 'baru') <> 'object' then
          raise exception 'Periode perpanjangannya tidak ada' using errcode = '22023';
        end if;
        insert into public.deposito_periode (user_id, deposito_id, ke, mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih)
        values (auth.uid(), per.deposito_id, per.ke + 1, (x -> 'baru' ->> 'mulai')::date, (x -> 'baru' ->> 'jatuh_tempo')::date,
                (x -> 'baru' ->> 'pokok')::numeric, (x -> 'baru' ->> 'bunga_kotor')::numeric,
                (x -> 'baru' ->> 'pajak')::numeric, (x -> 'baru' ->> 'bunga_bersih')::numeric)
        returning id into baru;
        peta := peta || jsonb_build_object(x -> 'baru' ->> 'kunci', baru);
      end if;
      update public.deposito_periode set
        bunga_diterima = (x ->> 'bunga')::numeric,
        dievaluasi_pada = sekarang,
        transaksi_tutup = dibuat,
        dari_rekening = true
      where id = per.id;
      n_deposito := n_deposito + 1;
    end loop;

    -- Sudah dievaluasi di aplikasi, bunganya beda dengan bank (K1): ikut bank.
    for x in select value from jsonb_array_elements(coalesce(p -> 'sesuaikan', '[]'::jsonb)) loop
      select * into per from public.deposito_periode where id = (x ->> 'periode')::uuid and bunga_diterima is not null for update;
      if not found then
        raise exception 'Periode deposito tidak ditemukan' using errcode = 'P0002';
      end if;
      if coalesce((x ->> 'bunga')::numeric, -1) < 0 then
        raise exception 'Bunga yang diterima tidak boleh minus' using errcode = '22023';
      end if;
      if jsonb_typeof(x -> 'transaksi') = 'object' then
        update public.transactions
           set amount = (x -> 'transaksi' ->> 'amount')::numeric, description = x -> 'transaksi' ->> 'description'
         where id = (x -> 'transaksi' ->> 'id')::uuid and id = any (coalesce(per.transaksi_tutup, '{}'));
      end if;
      update public.deposito_periode set
        bunga_diterima = (x ->> 'bunga')::numeric,
        transaksi_tutup = case when x ->> 'tambah' is null then transaksi_tutup
                               else coalesce(transaksi_tutup, '{}') || (peta ->> (x ->> 'tambah'))::uuid end
      where id = per.id;
      if jsonb_typeof(x -> 'berikut') = 'object' then
        update public.deposito_periode set
          pokok = (x -> 'berikut' ->> 'pokok')::numeric,
          bunga_kotor = (x -> 'berikut' ->> 'bunga_kotor')::numeric,
          pajak = (x -> 'berikut' ->> 'pajak')::numeric,
          bunga_bersih = (x -> 'berikut' ->> 'bunga_bersih')::numeric
        where id = (x -> 'berikut' ->> 'id')::uuid and deposito_id = per.deposito_id and ke = per.ke + 1
          and bunga_diterima is null and not dicairkan_awal;
      end if;
      n_deposito := n_deposito + 1;
    end loop;
  exception when unique_violation then
    raise exception 'Sebagian baris rekening koran ini sudah diimpor barusan. Buka pratinjaunya lagi.' using errcode = '23505';
  end;

  return jsonb_build_object('kantong', n_kantong, 'transaksi', n_sisip, 'tautan', n_tautan, 'deposito', n_deposito);
end;
$$;
revoke execute on function public.impor_rekening(jsonb) from public, anon;
grant execute on function public.impor_rekening(jsonb) to authenticated;

-- Sama dengan 20261114000000_urungkan_deposito.sql, ditambah dari_rekening kembali
-- false. Periode yang ditutup dari rekening koran: transaksi bunganya (dan pindah
-- kantong pencairannya) dihapus, jadi baris bank-nya kembali bebas.
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
    transaksi_tutup = null,
    dari_rekening = false
  where id = p.id;
end;
$$;
revoke execute on function public.urungkan_tutup_periode(uuid) from public, anon;
grant execute on function public.urungkan_tutup_periode(uuid) to authenticated;

-- K3: deposito "Sudah termasuk" baru dibuat, padahal penempatannya sudah terimpor
-- sebagai pengeluaran "Fund Placement" (tanggal = mulai periode ke-1, nominal =
-- pokok) di kantong induknya. Pengeluaran itu dihapus; pindah kantong pembuatan
-- deposito mengambil tanggal, jam, dan pengenal barisnya; saldo deposito berlaku
-- sejak 00.00 WIB tanggal itu (pindah kantong itulah yang mengisinya).
-- Mengembalikan salinan untuk urungkan_ganti_penempatan, atau null bila tidak ada.
create or replace function public.ganti_penempatan(p_deposito uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  k public.user_accounts;
  per public.deposito_periode;
  tf public.transactions;
  ex public.transactions;
  salinan jsonb;
begin
  select * into k from public.user_accounts
   where id = p_deposito and user_id = auth.uid() and kind = 'simpanan' and macam_simpanan = 'deposito';
  if not found then
    return null;
  end if;
  select * into per from public.deposito_periode where deposito_id = k.id and ke = 1;
  if not found then
    return null;
  end if;
  select * into tf from public.transactions t
   where t.type = 'transfer' and t.kantong_id = k.induk_id and t.kantong_tujuan_id = k.id
     and t.amount = per.pokok and t.ref_bank is null
   order by t.created_at desc limit 1;
  if not found then
    return null;
  end if;
  select * into ex from public.transactions t
   where t.type = 'expense' and t.source = 'statement' and t.status = 'confirmed'
     and t.kantong_id = k.induk_id and t.amount = per.pokok and t.transaction_date = per.mulai
     and t.merchant ilike 'Fund Placement'
   order by t.created_at limit 1;
  if not found then
    return null;
  end if;

  salinan := jsonb_build_object(
    'pengeluaran', to_jsonb(ex),
    'transfer', jsonb_build_object('id', tf.id, 'transaction_date', tf.transaction_date, 'waktu', tf.waktu),
    'kantong', jsonb_build_object('id', k.id, 'saldo_per', k.saldo_per, 'saldo_sejak', k.saldo_sejak)
  );
  delete from public.transactions where id = ex.id;
  update public.transactions
     set transaction_date = ex.transaction_date, waktu = ex.waktu, ref_bank = ex.ref_bank
   where id = tf.id;
  update public.user_accounts
     set saldo_per = ex.transaction_date, saldo_sejak = (ex.transaction_date::timestamp at time zone 'Asia/Jakarta')
   where id = k.id;
  return salinan;
end;
$$;

-- Urungkan ganti_penempatan dengan salinannya: pindah kantong kembali ke tanggal &
-- jamnya semula tanpa pengenal baris, pengeluarannya dimasukkan lagi (id sama),
-- saldo deposito berlaku sejak semula. RLS membatasi semuanya ke milik sendiri.
create or replace function public.urungkan_ganti_penempatan(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  ex public.transactions := jsonb_populate_record(null::public.transactions, p -> 'pengeluaran');
begin
  if ex.id is null or ex.type is distinct from 'expense' or ex.source is distinct from 'statement' then
    raise exception 'Salinan pengeluarannya tidak valid' using errcode = '22023';
  end if;
  update public.transactions
     set transaction_date = (p -> 'transfer' ->> 'transaction_date')::date,
         waktu = (p -> 'transfer' ->> 'waktu')::time,
         ref_bank = null
   where id = (p -> 'transfer' ->> 'id')::uuid and ref_bank is not distinct from ex.ref_bank;
  if not found then
    raise exception 'Pindah kantongnya sudah berubah' using errcode = '22023';
  end if;
  insert into public.transactions select ex.*;
  update public.user_accounts
     set saldo_per = (p -> 'kantong' ->> 'saldo_per')::date, saldo_sejak = (p -> 'kantong' ->> 'saldo_sejak')::timestamptz
   where id = (p -> 'kantong' ->> 'id')::uuid and user_id = auth.uid();
end;
$$;

revoke execute on function public.ganti_penempatan(uuid) from public, anon;
revoke execute on function public.urungkan_ganti_penempatan(jsonb) from public, anon;
grant execute on function public.ganti_penempatan(uuid) to authenticated;
grant execute on function public.urungkan_ganti_penempatan(jsonb) to authenticated;
