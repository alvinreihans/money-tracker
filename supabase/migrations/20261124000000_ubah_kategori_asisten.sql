-- =============================================================
-- Migration: kartu "X itu kategori Y" Tanya AI lewat terapkan_usulan
-- (docs/specs/SPEC-asisten-agen.md, keputusan 35)
--
-- usul_ubah_kategori dulu punya jalurnya sendiri (POST /api/kategori-merchant,
-- Urungkan = browser menulis kategori lama baris per baris, hanya selama
-- kartunya terbuka). Kini seragam dengan kartu usul_* lain: diterapkan lewat
-- terapkan_usulan (satu transaksi database, tercatat di private.aksi_asisten)
-- dan diurungkan lewat urungkan_aksi kapan saja (P6).
--
-- Perubahan terhadap 20261123000000_asisten_aksi.sql:
-- 1. terapkan_usulan: jenis baru 'ubah_kategori' dan isian
--    kategori_baru?: { type: expense|income, nama (1-30), kelompok? }. Kategori
--    dibuat (ikon receipt, warna bergilir, urutan terakhir) kecuali namanya sudah
--    ada untuk jenis itu (dipakai lagi). Isian ubah[].isian.category boleh "baru".
--    Hasil ditambah kategori_baru (slug).
-- 2. urungkan_aksi: kategori yang dibuat usulan itu ikut dihapus bila tidak
--    dipakai transaksi, budget, atau cicilan lagi. Hasil ditambah kategori_dihapus.
-- Keduanya tetap security definer, set search_path = '', selalu auth.uid().
-- =============================================================

create or replace function public.terapkan_usulan(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  opsi constant text := 'cipher-algo=aes256, s2k-mode=1';
  k text;
  jenis text := p ->> 'jenis';
  kb jsonb := p -> 'kantong_baru';
  kk jsonb := p -> 'kategori_baru';
  baru uuid;
  kat_baru text;
  kat_dibuat jsonb;
  nama_kat text;
  kel text;
  warna constant text[] := array['#ff9f43', '#5ecb7a', '#3e91ff', '#ff7a9c', '#ff5f5f', '#bf7af0', '#4fc9e0', '#8fa3bf'];
  x jsonb;
  i jsonb;
  t public.transactions;
  g public.transactions;
  ke uuid;
  kid uuid;
  ktid uuid;
  nominal numeric;
  tgl date;
  kat text;
  lepas jsonb;
  ikut jsonb;
  nama_ke text;
  langkah jsonb := '[]'::jsonb;
  disentuh uuid[] := '{}';
  sesudah jsonb;
  dihapus uuid[];
  aksi uuid;
  n integer := 0;
  jumlah integer;
begin
  if uid is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object'
     or jenis is null or jenis not in ('buat_kantong', 'jadikan_pindah', 'ubah_transaksi', 'ubah_kategori', 'hapus', 'selesaikan_draft', 'catat') then
    raise exception 'Usulannya tidak valid.' using errcode = '22023';
  end if;
  jumlah := private.panjang_larik(p -> 'ubah') + private.panjang_larik(p -> 'pindah') + private.panjang_larik(p -> 'hapus')
          + private.panjang_larik(p -> 'draft') + private.panjang_larik(p -> 'sisip');
  if jumlah > 200 then
    raise exception 'Satu usulan paling banyak 200 transaksi.' using errcode = '22023';
  end if;
  if jumlah = 0 and jsonb_typeof(kb) is distinct from 'object' then
    raise exception 'Usulannya kosong.' using errcode = '22023';
  end if;
  dihapus := array(select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(p -> 'hapus', '[]'::jsonb)) e);

  -- Kantong baru.
  if jsonb_typeof(kb) = 'object' then
    if coalesce(kb ->> 'jenis', '') not in ('bank', 'ewallet', 'cash') or length(btrim(coalesce(kb ->> 'nama', ''))) not between 1 and 40 then
      raise exception 'Isian kantong baru tidak valid.' using errcode = '22023';
    end if;
    if exists (select 1 from public.user_accounts a where a.user_id = uid and lower(a.name) = lower(btrim(kb ->> 'nama'))) then
      raise exception 'Kantong % sudah ada.', btrim(kb ->> 'nama') using errcode = '22023';
    end if;
    nominal := coalesce((kb ->> 'saldo_awal')::numeric, 0);
    if nominal < 0 or nominal > 1e12 then
      raise exception 'Saldo awal kantong baru tidak valid.' using errcode = '22023';
    end if;
    insert into public.user_accounts (user_id, name, kind, emoji, saldo_awal, saldo_sejak)
    values (
      uid, btrim(kb ->> 'nama'), kb ->> 'jenis',
      case kb ->> 'jenis' when 'ewallet' then '📱' when 'cash' then '💵' else '🏦' end,
      nominal, coalesce((kb ->> 'saldo_sejak')::timestamptz, date_trunc('minute', now()))
    )
    returning id into baru;
  end if;

  -- Kategori baru (usul_ubah_kategori, "X itu kategori Laundry"). Nama yang sudah ada
  -- (tanpa beda huruf besar-kecil) dipakai lagi, seperti /api/kategori-merchant dulu.
  if jsonb_typeof(kk) = 'object' then
    nama_kat := btrim(regexp_replace(coalesce(kk ->> 'nama', ''), '\s+', ' ', 'g'));
    if coalesce(kk ->> 'type', '') not in ('expense', 'income') or length(nama_kat) not between 1 and 30 then
      raise exception 'Isian kategori baru tidak valid.' using errcode = '22023';
    end if;
    kel := case when kk ->> 'type' = 'expense' then coalesce(nullif(kk ->> 'kelompok', ''), 'keinginan') end;
    if kel is not null and kel not in ('kebutuhan', 'keinginan', 'tabungan', 'berbagi', 'pengembangan', 'tak_terduga') then
      raise exception 'Isian kategori baru tidak valid.' using errcode = '22023';
    end if;
    select c.slug into kat_baru from public.categories c
     where c.user_id = uid and c.type = kk ->> 'type' and lower(btrim(c.name)) = lower(nama_kat);
    if kat_baru is null then
      kat_baru := 'c-' || left(replace(gen_random_uuid()::text, '-', ''), 10);
      insert into public.categories (user_id, type, slug, name, icon, color, kelompok, sort)
      select uid, kk ->> 'type', kat_baru, nama_kat, 'receipt',
             warna[1 + (count(*) % array_length(warna, 1))::int], kel,
             coalesce(max(c.sort) filter (where c.slug <> 'other'), 0) + 1
        from public.categories c where c.user_id = uid and c.type = kk ->> 'type';
      kat_dibuat := jsonb_build_object('type', kk ->> 'type', 'slug', kat_baru);
    end if;
  end if;

  -- Ubah transaksi tercatat.
  for x in select value from jsonb_array_elements(coalesce(p -> 'ubah', '[]'::jsonb)) loop
    select * into t from public.transactions v
     where v.id = (x ->> 'id')::uuid and v.updated_at = (x ->> 'updated_at')::timestamptz and v.status = 'confirmed';
    if not found then
      raise exception 'Datanya sudah berubah, minta usulan lagi.' using errcode = '22023';
    end if;
    i := coalesce(x -> 'isian', '{}'::jsonb);
    nominal := coalesce((i ->> 'amount')::numeric, t.amount);
    tgl := coalesce((i ->> 'transaction_date')::date, t.transaction_date);
    if (t.ref_bank is not null or t.ref_bank_tujuan is not null) and (nominal <> t.amount or tgl <> t.transaction_date) then
      raise exception 'Nominal & tanggal transaksi dari rekening koran tidak bisa diubah (angka bank).' using errcode = '22023';
    end if;
    if nominal <= 0 or nominal > 1e12 then
      raise exception 'Nominalnya harus lebih dari 0.' using errcode = '22023';
    end if;
    kid := case when i ? 'kantong_id' then private.kantong_usulan(i ->> 'kantong_id', baru, uid, false) else t.kantong_id end;
    ktid := case when t.type = 'transfer' and i ? 'kantong_tujuan_id' then private.kantong_usulan(i ->> 'kantong_tujuan_id', baru, uid, false) else t.kantong_tujuan_id end;
    if (t.ref_bank is not null and kid is distinct from t.kantong_id) or (t.ref_bank_tujuan is not null and ktid is distinct from t.kantong_tujuan_id) then
      raise exception 'Kantong transaksi dari rekening koran tidak bisa diubah.' using errcode = '22023';
    end if;
    if t.type = 'transfer' and (kid is null or ktid is null or kid = ktid) then
      raise exception 'Kantong asal dan tujuan pindah kantong harus berbeda.' using errcode = '22023';
    end if;
    kat := t.category;
    if t.type <> 'transfer' and i ? 'category' then
      kat := i ->> 'category';
      -- "baru" = kategori yang dibuat usulan ini.
      if kat = 'baru' then
        if kat_baru is null then
          raise exception 'Kategori barunya tidak ada di usulan ini.' using errcode = '22023';
        end if;
        kat := kat_baru;
      end if;
      if not exists (select 1 from public.categories c where c.user_id = uid and c.type = t.type and c.slug = kat) then
        raise exception 'Kategorinya tidak ditemukan.' using errcode = '22023';
      end if;
    end if;
    langkah := langkah || jsonb_build_array(jsonb_build_object('op', 'ubah', 'baris', to_jsonb(t)));
    update public.transactions set
      amount = nominal,
      transaction_date = tgl,
      category = kat,
      kelompok = case when kat is distinct from t.category then null else t.kelompok end,
      merchant = case when i ? 'merchant' then left(nullif(btrim(i ->> 'merchant'), ''), 100) else t.merchant end,
      description = case when i ? 'description' then left(nullif(btrim(i ->> 'description'), ''), 500) else t.description end,
      kantong_id = kid,
      kantong_tujuan_id = ktid,
      waktu = case when i ? 'waktu' then (nullif(i ->> 'waktu', ''))::time else t.waktu end,
      -- Kategori/merchant diisi: tidak lagi "perlu dilengkapi".
      perlu_dilengkapi = case when (i ? 'category' or i ? 'merchant') then false else t.perlu_dilengkapi end
    where id = t.id;
    disentuh := disentuh || t.id;
    n := n + 1;
  end loop;

  -- Pengeluaran/pemasukan → pindah kantong (pola jadikan_pindah, sumber apa pun).
  for x in select value from jsonb_array_elements(coalesce(p -> 'pindah', '[]'::jsonb)) loop
    select * into t from public.transactions v
     where v.id = (x ->> 'id')::uuid and v.updated_at = (x ->> 'updated_at')::timestamptz
       and v.status = 'confirmed' and v.type in ('expense', 'income')
       and v.kantong_id is not null and v.kantong_tujuan_id is null and v.ref_bank_tujuan is null
       and v.induk_id is null and v.cicilan_id is null and v.pecahan_dari is null;
    if not found then
      raise exception 'Datanya sudah berubah, minta usulan lagi.' using errcode = '22023';
    end if;
    ke := private.kantong_usulan(x ->> 'ke', baru, uid, true);
    if ke is null or ke = t.kantong_id then
      raise exception 'Kantong tujuannya harus kantong lain.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.user_accounts a where a.id = t.kantong_id and a.user_id = uid and a.kind in ('bank', 'ewallet', 'cash', 'tujuan', 'simpanan')) then
      raise exception 'Hanya transaksi di kantong uang yang bisa jadi pindah kantong.' using errcode = '22023';
    end if;
    g := null;
    if jsonb_typeof(x -> 'gabung') = 'object' then
      select * into g from public.transactions v
       where v.id = (x -> 'gabung' ->> 'id')::uuid and v.updated_at = (x -> 'gabung' ->> 'updated_at')::timestamptz
         and v.status = 'confirmed' and v.kantong_id = ke and v.kantong_tujuan_id is null
         and v.type = case when t.type = 'expense' then 'income' else 'expense' end
         and v.amount = t.amount and v.induk_id is null and v.cicilan_id is null and v.pecahan_dari is null
         and v.id <> t.id;
      if not found then
        raise exception 'Datanya sudah berubah, minta usulan lagi.' using errcode = '22023';
      end if;
    end if;
    select a.name into nama_ke from public.user_accounts a where a.id = ke and a.user_id = uid;
    -- Ikutan yang akan hilang dilepas dulu (seperti jadikan_pindah): ikutan sisi lawan & cashback transaksi ini.
    select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'induk_id', v.induk_id)), '[]'::jsonb) into lepas
      from public.transactions v
     where (g.id is not null and v.induk_id = g.id)
        or (v.induk_id = t.id and v.type = 'income' and v.category = 'refund');
    update public.transactions set induk_id = null
     where id in (select (e ->> 'id')::uuid from jsonb_array_elements(lepas) e);
    langkah := langkah || jsonb_build_array(jsonb_build_object(
      'op', 'pindah', 'baris', to_jsonb(t), 'gabung', case when g.id is null then null else to_jsonb(g) end, 'lepas', lepas));
    if g.id is not null then
      delete from public.transactions where id = g.id;
    end if;
    update public.transactions set
      type = 'transfer', category = 'other', kelompok = null, perlu_dilengkapi = false,
      merchant = left(coalesce(nullif(btrim(x ->> 'merchant'), ''),
                               case when t.type = 'expense' then 'Pindah ke ' else 'Pindah dari ' end || nama_ke), 100),
      kantong_id = case when t.type = 'expense' then t.kantong_id else ke end,
      kantong_tujuan_id = case when t.type = 'expense' then ke else t.kantong_id end,
      ref_bank = case when t.type = 'expense' then t.ref_bank else g.ref_bank end,
      ref_bank_tujuan = case when t.type = 'expense' then g.ref_bank else t.ref_bank end,
      waktu = coalesce(t.waktu, g.waktu),
      description = coalesce(t.description, g.description)
    where id = t.id;
    disentuh := disentuh || t.id;
    n := n + 1;
  end loop;

  -- Hapus (mis. dobel). Rekening koran hanya bila ada kembarannya yang tidak ikut dihapus.
  for x in select value from jsonb_array_elements(coalesce(p -> 'hapus', '[]'::jsonb)) loop
    select * into t from public.transactions v
     where v.id = (x ->> 'id')::uuid and v.updated_at = (x ->> 'updated_at')::timestamptz;
    if not found then
      raise exception 'Datanya sudah berubah, minta usulan lagi.' using errcode = '22023';
    end if;
    if exists (select 1 from public.transactions v where v.pecahan_dari = t.id) then
      raise exception 'Transaksi yang sudah dipecah dihapus lewat aplikasi ya.' using errcode = '22023';
    end if;
    if (t.ref_bank is not null or t.ref_bank_tujuan is not null) and not exists (
      select 1 from public.transactions v
       where v.id <> t.id and not (v.id = any (dihapus)) and v.status = 'confirmed'
         and v.type = t.type and v.amount = t.amount and v.kantong_id is not distinct from t.kantong_id
         and abs(v.transaction_date - t.transaction_date) <= 1
    ) then
      raise exception 'Transaksi dari rekening koran hanya bisa dihapus bila ada kembarannya.' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) into ikut from public.transactions v where v.induk_id = t.id;
    langkah := langkah || jsonb_build_array(jsonb_build_object('op', 'hapus', 'baris', to_jsonb(t), 'ikutan', ikut));
    delete from public.transactions where id = t.id;
    n := n + 1;
  end loop;

  -- Selesaikan draft "Belum selesai": isi yang kurang lalu simpan (seperti selesaikanDraft).
  for x in select value from jsonb_array_elements(coalesce(p -> 'draft', '[]'::jsonb)) loop
    select * into t from public.transactions v
     where v.id = (x ->> 'id')::uuid and v.updated_at = (x ->> 'updated_at')::timestamptz
       and v.status = 'needs_review' and v.induk_id is null;
    if not found then
      raise exception 'Datanya sudah berubah, minta usulan lagi.' using errcode = '22023';
    end if;
    if t.cicilan_id is not null then
      raise exception 'Draft bayar cicilan diselesaikan di aplikasi ya.' using errcode = '22023';
    end if;
    if not (t.amount > 0) then
      raise exception 'Nominal draft ini belum terbaca; lengkapi di aplikasi.' using errcode = '22023';
    end if;
    i := coalesce(x -> 'isian', '{}'::jsonb);
    kid := case when i ? 'kantong_id' then private.kantong_usulan(i ->> 'kantong_id', baru, uid, false) else t.kantong_id end;
    ktid := case when t.type = 'transfer' and i ? 'kantong_tujuan_id' then private.kantong_usulan(i ->> 'kantong_tujuan_id', baru, uid, false) else t.kantong_tujuan_id end;
    if kid is null then
      raise exception 'Kantong draft ini belum diisi.' using errcode = '22023';
    end if;
    if t.type = 'transfer' and (ktid is null or ktid = kid) then
      raise exception 'Kantong asal dan tujuan pindah kantong harus berbeda.' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) into ikut from public.transactions v where v.induk_id = t.id;
    langkah := langkah || jsonb_build_array(jsonb_build_object('op', 'draft', 'baris', to_jsonb(t), 'ikutan', ikut));
    -- Jejak dulu: begitu statusnya confirmed, baris draft (jejak & thumbnail-nya) dihapus trigger.
    perform public.tambah_jejak(t.id, jsonb_build_object('disimpan', now(), 'cara', 'asisten'));
    update public.transactions set
      kantong_id = kid, kantong_tujuan_id = ktid,
      waktu = case when i ? 'waktu' then (nullif(i ->> 'waktu', ''))::time else t.waktu end,
      status = 'confirmed', raw_ocr_text = null, bukti_transfer = null
    where id = t.id;
    -- Biaya admin / cashback mengikuti induknya: ikut dihitung, dari kantong yang sama.
    update public.transactions v set status = 'confirmed',
      kantong_id = case when v.type = 'expense' or v.kantong_id is null or v.kantong_id = t.kantong_id then kid else v.kantong_id end
     where v.induk_id = t.id;
    disentuh := disentuh || t.id;
    n := n + 1;
  end loop;

  -- Catat transaksi baru (ketikan lewat Tanya AI).
  for x in select value from jsonb_array_elements(coalesce(p -> 'sisip', '[]'::jsonb)) loop
    if coalesce(x ->> 'type', '') not in ('expense', 'income', 'transfer') then
      raise exception 'Jenis transaksinya tidak valid.' using errcode = '22023';
    end if;
    nominal := (x ->> 'amount')::numeric;
    if nominal is null or nominal <= 0 or nominal > 1e12 then
      raise exception 'Nominalnya harus lebih dari 0.' using errcode = '22023';
    end if;
    tgl := (x ->> 'transaction_date')::date;
    if tgl is null or tgl > (now() at time zone 'Asia/Jakarta')::date + 1 then
      raise exception 'Tanggalnya tidak valid.' using errcode = '22023';
    end if;
    kid := private.kantong_usulan(x ->> 'kantong_id', baru, uid, false);
    if kid is null then
      raise exception 'Kantongnya belum diisi.' using errcode = '22023';
    end if;
    ktid := null;
    kat := 'other';
    if x ->> 'type' = 'transfer' then
      ktid := private.kantong_usulan(x ->> 'kantong_tujuan_id', baru, uid, false);
      if ktid is null or ktid = kid then
        raise exception 'Kantong asal dan tujuan pindah kantong harus berbeda.' using errcode = '22023';
      end if;
    else
      kat := coalesce(nullif(x ->> 'category', ''), 'other');
      if not exists (select 1 from public.categories c where c.user_id = uid and c.type = x ->> 'type' and c.slug = kat) then
        raise exception 'Kategorinya tidak ditemukan.' using errcode = '22023';
      end if;
    end if;
    insert into public.transactions (id, user_id, amount, type, category, merchant, description, transaction_date, waktu,
                                     kantong_id, kantong_tujuan_id, status, source, created_at)
    values (gen_random_uuid(), uid, nominal, x ->> 'type', kat,
            left(nullif(btrim(x ->> 'merchant'), ''), 100), left(nullif(btrim(x ->> 'description'), ''), 500),
            tgl, (nullif(x ->> 'waktu', ''))::time, kid, ktid, 'confirmed', 'text', now())
    returning * into t;
    perform public.tambah_jejak(t.id, jsonb_build_object('asal', 'asisten', 'teks', left(x ->> 'teks', 300), 'disimpan', now(), 'cara', 'asisten'));
    langkah := langkah || jsonb_build_array(jsonb_build_object('op', 'catat', 'id', t.id));
    disentuh := disentuh || t.id;
    n := n + 1;
  end loop;

  -- Isi sesudah: updated_at tiap baris yang diubah/dibuat, pembanding saat Urungkan.
  select coalesce(jsonb_object_agg(v.id, v.updated_at), '{}'::jsonb) into sesudah
    from public.transactions v where v.id = any (disentuh);
  k := private.kunci_transaksi();
  insert into private.aksi_asisten (user_id, jenis, ringkasan, sebelum_enc, sesudah_enc)
  values (
    uid, jenis, left(coalesce(p ->> 'ringkasan', ''), 300),
    extensions.pgp_sym_encrypt(jsonb_build_object('kantong_baru', baru, 'kategori_baru', kat_dibuat, 'langkah', langkah)::text, k, opsi),
    extensions.pgp_sym_encrypt(sesudah::text, k, opsi)
  )
  returning id into aksi;
  return jsonb_build_object('aksi_id', aksi, 'n', n, 'kantong_baru', baru, 'kategori_baru', kat_baru);
exception
  when unique_violation then
    raise exception 'Datanya sudah berubah, minta usulan lagi.' using errcode = '22023';
  when foreign_key_violation then
    raise exception 'Kategori atau kantongnya tidak ditemukan.' using errcode = '22023';
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'Usulannya tidak valid.' using errcode = '22023';
end;
$$;

create or replace function public.urungkan_aksi(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  a private.aksi_asisten;
  k text;
  isi jsonb;
  sesudah jsonb;
  x jsonb;
  e jsonb;
  r public.transactions;
  g public.transactions;
  baru uuid;
  kat jsonb;
  kantong_dihapus boolean := false;
  kategori_dihapus boolean := false;
  n integer := 0;
begin
  if uid is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;
  select * into a from private.aksi_asisten where id = p_id and user_id = uid for update;
  if not found then
    raise exception 'Usulan ini tidak ditemukan.' using errcode = '22023';
  end if;
  if a.diurungkan_pada is not null then
    raise exception 'Usulan ini sudah diurungkan.' using errcode = '22023';
  end if;
  k := private.kunci_transaksi();
  isi := extensions.pgp_sym_decrypt(a.sebelum_enc, k)::jsonb;
  sesudah := extensions.pgp_sym_decrypt(a.sesudah_enc, k)::jsonb;
  baru := (isi ->> 'kantong_baru')::uuid;
  kat := isi -> 'kategori_baru';

  -- Semua baris masih seperti sesudah diterapkan?
  if exists (
    select 1 from jsonb_each_text(sesudah) s
     where not exists (select 1 from public.transactions v where v.id = s.key::uuid and v.updated_at = s.value::timestamptz)
  ) then
    raise exception 'Sebagian transaksinya sudah diubah lagi sejak diterapkan, jadi tidak bisa diurungkan.' using errcode = '22023';
  end if;

  -- Dibalik dari langkah terakhir.
  for x in select l.value from jsonb_array_elements(isi -> 'langkah') with ordinality l(value, urut) order by l.urut desc loop
    if x ->> 'op' in ('ubah', 'pindah', 'draft') then
      r := jsonb_populate_record(null::public.transactions, x -> 'baris');
      update public.transactions set
        amount = r.amount, type = r.type, category = r.category, kelompok = r.kelompok,
        merchant = r.merchant, description = r.description,
        kantong_id = r.kantong_id, kantong_tujuan_id = r.kantong_tujuan_id,
        transaction_date = r.transaction_date, waktu = r.waktu,
        ref_bank = r.ref_bank, ref_bank_tujuan = r.ref_bank_tujuan,
        perlu_dilengkapi = r.perlu_dilengkapi, status = r.status,
        raw_ocr_text = r.raw_ocr_text, bukti_transfer = r.bukti_transfer
      where id = r.id;
      if not found then
        raise exception 'Sebagian transaksinya sudah dihapus, jadi tidak bisa diurungkan.' using errcode = '22023';
      end if;
      if x ->> 'op' = 'pindah' then
        if jsonb_typeof(x -> 'gabung') = 'object' then
          g := jsonb_populate_record(null::public.transactions, x -> 'gabung');
          insert into public.transactions select g.*;
        end if;
        -- Ikutan yang dilepas menempel lagi ke induk semulanya (yang masih lepas saja).
        update public.transactions v set induk_id = (l ->> 'induk_id')::uuid
          from jsonb_array_elements(coalesce(x -> 'lepas', '[]'::jsonb)) l
         where v.id = (l ->> 'id')::uuid and v.induk_id is null;
      elsif x ->> 'op' = 'draft' then
        for e in select value from jsonb_array_elements(coalesce(x -> 'ikutan', '[]'::jsonb)) loop
          update public.transactions set status = e ->> 'status', kantong_id = (e ->> 'kantong_id')::uuid
           where id = (e ->> 'id')::uuid;
        end loop;
        -- Jejak & thumbnail kembali ke draft-nya.
        perform public.urungkan_jejak(r.id);
      end if;
    elsif x ->> 'op' = 'hapus' then
      r := jsonb_populate_record(null::public.transactions, x -> 'baris');
      if not exists (select 1 from public.transactions v where v.id = r.id) then
        insert into public.transactions select r.*;
      end if;
      for e in select value from jsonb_array_elements(coalesce(x -> 'ikutan', '[]'::jsonb)) loop
        g := jsonb_populate_record(null::public.transactions, e);
        if not exists (select 1 from public.transactions v where v.id = g.id) then
          insert into public.transactions select g.*;
        end if;
      end loop;
    elsif x ->> 'op' = 'catat' then
      delete from public.transactions where id = (x ->> 'id')::uuid;
    end if;
    n := n + 1;
  end loop;

  -- Kantong yang dibuat usulan ini: dihapus bila tidak dipakai transaksi atau simpanan lain.
  if baru is not null
     and not exists (select 1 from public.transactions v where v.kantong_id = baru or v.kantong_tujuan_id = baru)
     and not exists (select 1 from public.user_accounts c where c.induk_id = baru) then
    delete from public.user_accounts where id = baru and user_id = uid;
    kantong_dihapus := found;
  end if;

  -- Kategori yang dibuat usulan ini: dihapus bila tidak dipakai transaksi, budget, atau cicilan.
  if jsonb_typeof(kat) = 'object'
     and not exists (select 1 from private.transaksi_data v where v.user_id = uid and v.type = kat ->> 'type' and v.category = kat ->> 'slug')
     and not exists (select 1 from public.budgets b where b.user_id = uid and b.type = kat ->> 'type' and b.category = kat ->> 'slug')
     and not exists (select 1 from public.cicilan c where c.user_id = uid and c.type = kat ->> 'type' and c.category = kat ->> 'slug') then
    delete from public.categories where user_id = uid and type = kat ->> 'type' and slug = kat ->> 'slug';
    kategori_dihapus := found;
  end if;

  update private.aksi_asisten set diurungkan_pada = now() where id = a.id;
  return jsonb_build_object('n', n, 'kantong_dihapus', kantong_dihapus, 'kategori_dihapus', kategori_dihapus);
exception
  when unique_violation then
    raise exception 'Datanya sudah berubah, jadi tidak bisa diurungkan.' using errcode = '22023';
end;
$$;

revoke execute on function public.terapkan_usulan(jsonb) from public, anon;
revoke execute on function public.urungkan_aksi(uuid) from public, anon;
grant execute on function public.terapkan_usulan(jsonb) to authenticated;
grant execute on function public.urungkan_aksi(uuid) to authenticated;

notify pgrst, 'reload schema';
