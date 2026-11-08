-- SPEC-kantong-sendiri tahap 2: jadikan_pindah tidak lagi menghilangkan ikutan diam-diam.
--
-- Dua jalan ikutan (cashback/biaya admin yang menempel lewat induk_id) hilang tanpa jejak:
-- 1. sisi lawan (`gabung`) dihapus → induk_id "on delete cascade" ikut menghapus ikutannya;
-- 2. transaksinya sendiri berubah jadi pindah kantong → trigger ikutan_sesuai_jenis menghapus
--    cashback (pemasukan Refund) yang menempel, karena cashback hanya untuk belanja.
-- Keduanya juga tidak dikembalikan urungkan_jadikan_pindah. Sekarang ikutan itu dilepas dulu
-- (induk_id = null): tetap tercatat dan tetap terhitung di kantongnya, tampil sebagai transaksi
-- sendiri. Biaya admin di transaksi yang jadi pindah kantong tetap menempel (memang cocok).
-- Salinan mencatat yang dilepas (`lepas: [{ id, induk_id }]`); Urungkan menempelkannya lagi.
-- Selebihnya sama dengan 20261118000000_kantong_sendiri.sql.

create or replace function public.jadikan_pindah(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  x jsonb;
  t public.transactions;
  g public.transactions;
  lawan uuid;
  sesudah timestamptz;
  lepas jsonb;
  salinan jsonb := '[]'::jsonb;
  n int := 0;
begin
  if auth.uid() is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'ubah') is distinct from 'array' or jsonb_array_length(p -> 'ubah') = 0 then
    raise exception 'Tidak ada transaksi yang diubah' using errcode = '22023';
  end if;
  for x in select value from jsonb_array_elements(p -> 'ubah') loop
    select * into t from public.transactions v
     where v.id = (x ->> 'id')::uuid
       and v.status = 'confirmed' and v.source = 'statement' and v.type in ('expense', 'income')
       and v.kantong_id is not null and v.kantong_tujuan_id is null and v.ref_bank_tujuan is null
       and v.induk_id is null and v.cicilan_id is null and v.pecahan_dari is null
       and v.updated_at = (x ->> 'updated_at')::timestamptz;
    if not found then
      raise exception 'Transaksinya sudah berubah sejak ditampilkan. Muat ulang dulu.' using errcode = '22023';
    end if;
    lawan := (x ->> 'kantong_lawan')::uuid;
    if lawan is null or lawan = t.kantong_id or not exists (
      select 1 from public.user_accounts a where a.id = lawan and a.user_id = auth.uid() and a.kind in ('bank', 'ewallet', 'cash')
    ) then
      raise exception 'Kantong tujuannya tidak ditemukan' using errcode = '22023';
    end if;
    g := null;
    if jsonb_typeof(x -> 'gabung') = 'object' then
      select * into g from public.transactions v
       where v.id = (x -> 'gabung' ->> 'id')::uuid
         and v.status = 'confirmed' and v.kantong_id = lawan and v.kantong_tujuan_id is null
         and v.type = case when t.type = 'expense' then 'income' else 'expense' end
         and v.amount = t.amount and v.induk_id is null and v.cicilan_id is null and v.pecahan_dari is null
         and v.updated_at = (x -> 'gabung' ->> 'updated_at')::timestamptz;
      if not found then
        raise exception 'Transaksinya sudah berubah sejak ditampilkan. Muat ulang dulu.' using errcode = '22023';
      end if;
    end if;

    -- Ikutan yang akan hilang dilepas dulu: semua ikutan sisi lawan, dan cashback transaksi ini.
    select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'induk_id', v.induk_id)), '[]'::jsonb) into lepas
      from public.transactions v
     where v.induk_id = g.id
        or (v.induk_id = t.id and v.type = 'income' and v.category = 'refund');
    update public.transactions set induk_id = null
     where id in (select (e ->> 'id')::uuid from jsonb_array_elements(lepas) e);
    if g.id is not null then
      delete from public.transactions where id = g.id;
    end if;

    update public.transactions set
      type = 'transfer', category = 'other', kelompok = null, perlu_dilengkapi = false,
      merchant = left(coalesce(nullif(x ->> 'merchant', ''), t.merchant), 100),
      kantong_id = case when t.type = 'expense' then t.kantong_id else lawan end,
      kantong_tujuan_id = case when t.type = 'expense' then lawan else t.kantong_id end,
      ref_bank = case when t.type = 'expense' then t.ref_bank else g.ref_bank end,
      ref_bank_tujuan = case when t.type = 'expense' then g.ref_bank else t.ref_bank end,
      waktu = coalesce(t.waktu, g.waktu),
      description = coalesce(t.description, g.description)
    where id = t.id;
    select v.updated_at into sesudah from public.transactions v where v.id = t.id;

    salinan := salinan || jsonb_build_array(jsonb_build_object(
      'id', t.id, 'sesudah', sesudah,
      'semula', jsonb_build_object(
        'type', t.type, 'category', t.category, 'kelompok', t.kelompok, 'merchant', t.merchant,
        'kantong_id', t.kantong_id, 'kantong_tujuan_id', t.kantong_tujuan_id,
        'ref_bank', t.ref_bank, 'ref_bank_tujuan', t.ref_bank_tujuan,
        'perlu_dilengkapi', t.perlu_dilengkapi, 'waktu', t.waktu, 'description', t.description),
      'gabung', case when g.id is null then null else to_jsonb(g) end,
      'lepas', lepas
    ));
    n := n + 1;
  end loop;
  return jsonb_build_object('n', n, 'salinan', salinan);
exception when unique_violation then
  raise exception 'Transaksinya sudah berubah sejak ditampilkan. Muat ulang dulu.' using errcode = '23505';
end;
$$;

create or replace function public.urungkan_jadikan_pindah(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  x jsonb;
  s jsonb;
  g public.transactions;
  n int := 0;
begin
  if auth.uid() is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'salinan') is distinct from 'array' then
    raise exception 'Salinannya tidak valid' using errcode = '22023';
  end if;
  for x in select value from jsonb_array_elements(p -> 'salinan') loop
    s := x -> 'semula';
    g := null;
    if s ->> 'type' not in ('expense', 'income') then
      raise exception 'Salinannya tidak valid' using errcode = '22023';
    end if;
    update public.transactions set
      type = s ->> 'type', category = coalesce(s ->> 'category', 'other'), kelompok = s ->> 'kelompok',
      merchant = s ->> 'merchant', kantong_id = (s ->> 'kantong_id')::uuid, kantong_tujuan_id = null,
      ref_bank = s ->> 'ref_bank', ref_bank_tujuan = s ->> 'ref_bank_tujuan',
      perlu_dilengkapi = coalesce((s ->> 'perlu_dilengkapi')::boolean, false),
      waktu = (s ->> 'waktu')::time, description = s ->> 'description'
    where id = (x ->> 'id')::uuid and type = 'transfer' and source = 'statement'
      and updated_at = (x ->> 'sesudah')::timestamptz;
    if not found then
      raise exception 'Pindah kantongnya sudah diubah lagi, jadi tidak bisa diurungkan.' using errcode = '22023';
    end if;
    if jsonb_typeof(x -> 'gabung') = 'object' then
      g := jsonb_populate_record(null::public.transactions, x -> 'gabung');
      if g.id is null or g.type not in ('expense', 'income') then
        raise exception 'Salinannya tidak valid' using errcode = '22023';
      end if;
      insert into public.transactions select g.*;
    end if;
    -- Ikutan yang dilepas menempel lagi ke induk semulanya (yang masih lepas saja).
    -- Trigger tulis memeriksa induknya milik sendiri.
    if jsonb_typeof(x -> 'lepas') = 'array' then
      update public.transactions v set induk_id = (e ->> 'induk_id')::uuid
        from jsonb_array_elements(x -> 'lepas') e
       where v.id = (e ->> 'id')::uuid and v.induk_id is null
         and (e ->> 'induk_id')::uuid in ((x ->> 'id')::uuid, g.id);
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('n', n);
end;
$$;

revoke execute on function public.jadikan_pindah(jsonb) from public, anon;
revoke execute on function public.urungkan_jadikan_pindah(jsonb) from public, anon;
grant execute on function public.jadikan_pindah(jsonb) to authenticated;
grant execute on function public.urungkan_jadikan_pindah(jsonb) to authenticated;
