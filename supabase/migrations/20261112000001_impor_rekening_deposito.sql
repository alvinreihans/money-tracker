-- Impor rekening koran: deposito SeaBank tidak terhitung dua kali
-- (docs/specs/SPEC-impor-rekening.md, keputusan 10). impor_rekening sama dengan
-- 20261112000000_impor_rekening.sql, ditambah:
--   - deposito_baru[].didanai (tanggal penempatan): deposito bersaldo 0 sejak
--     tanggal itu, diisi pindah kantong penempatannya;
--   - jadi_pindah[]: pengeluaran "Fund Placement" dari impor sebelumnya diubah
--     jadi pindah kantong ke depositonya.
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

  -- Samakan saldo awal (K4).
  for x in select value from jsonb_array_elements(coalesce(p -> 'saldo', '[]'::jsonb)) loop
    update public.user_accounts
       set saldo_awal = (x ->> 'saldo_awal')::numeric, saldo_sejak = (x ->> 'saldo_sejak')::timestamptz
     where id = (coalesce(peta ->> (x ->> 'kantong_id'), x ->> 'kantong_id'))::uuid and user_id = auth.uid();
  end loop;

  begin
    -- Transaksi baru: induk dulu, lalu ikutannya (biaya transfer).
    for x in
      select value from jsonb_array_elements(coalesce(p -> 'sisip', '[]'::jsonb))
      order by (value ->> 'induk') is not null
    loop
      insert into public.transactions (
        user_id, amount, type, category, merchant, description, transaction_date, waktu,
        kantong_id, kantong_tujuan_id, induk_id, status, source, ref_bank, ref_bank_tujuan, perlu_dilengkapi
      ) values (
        auth.uid(), (x ->> 'amount')::numeric, x ->> 'type', coalesce(x ->> 'category', 'other'),
        x ->> 'merchant', x ->> 'description', (x ->> 'transaction_date')::date, (x ->> 'waktu')::time,
        (coalesce(peta ->> (x ->> 'kantong_id'), x ->> 'kantong_id'))::uuid,
        (coalesce(peta ->> (x ->> 'kantong_tujuan_id'), x ->> 'kantong_tujuan_id'))::uuid,
        (peta ->> (x ->> 'induk'))::uuid,
        'confirmed', 'statement', x ->> 'ref_bank', x ->> 'ref_bank_tujuan', coalesce((x ->> 'perlu_dilengkapi')::boolean, false)
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
  exception when unique_violation then
    raise exception 'Sebagian baris rekening koran ini sudah diimpor barusan. Buka pratinjaunya lagi.' using errcode = '23505';
  end;

  return jsonb_build_object('kantong', n_kantong, 'transaksi', n_sisip, 'tautan', n_tautan);
end;
$$;
revoke execute on function public.impor_rekening(jsonb) from public, anon;
grant execute on function public.impor_rekening(jsonb) to authenticated;
