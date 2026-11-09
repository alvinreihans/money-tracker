-- =============================================================
-- Migration: asisten yang bisa bertindak, tahap B (docs/specs/SPEC-asisten-agen.md §3, P1, P4–P6)
--
-- 1. aksi_asisten: setiap kartu usulan Tanya AI yang diterapkan dicatat (isi
--    sebelum & sesudah per baris) supaya bisa diurungkan persis, tanpa batas
--    waktu (P6), selama baris-barisnya belum diubah lagi.
-- 2. terapkan_usulan(jsonb): satu kartu = satu transaksi database (gagal
--    sebagian = tidak ada yang berubah). Semua isian divalidasi di sini, bukan
--    dipercaya dari AI atau browser.
-- 3. urungkan_aksi(uuid): membalik satu aksi.
-- 4. obrolan_asisten: riwayat percakapan Tanya AI (P4).
--
-- Isi aksi & obrolan memuat merchant, keterangan, dan nominal, jadi disimpan
-- terenkripsi dengan kunci Vault yang sama dengan teks transaksi
-- (SPEC-enkripsi) di skema private, dan hanya bisa disentuh lewat fungsi di
-- bawah — semuanya security definer yang selalu memakai auth.uid().
--
-- Tulis transaksi tetap lewat view public.transactions: view itu sendiri
-- hanya menampilkan baris auth.uid(), dan trigger tulisnya memeriksa pemilik
-- & rujukan. Kantong & kategori diperiksa eksplisit (user_id = auth.uid())
-- karena security definer melewati RLS.
-- =============================================================

-- 1. Tabel ------------------------------------------------------------------

create table if not exists private.aksi_asisten (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  dibuat          timestamptz not null default now(),
  jenis           text not null check (length(jenis) between 1 and 40),
  ringkasan       text not null default '' check (length(ringkasan) <= 300),
  sebelum_enc     bytea not null,
  sesudah_enc     bytea not null,
  diurungkan_pada timestamptz
);
create index if not exists idx_aksi_asisten_user on private.aksi_asisten (user_id, dibuat desc);
alter table private.aksi_asisten enable row level security;
revoke all on private.aksi_asisten from anon, authenticated, service_role;
drop policy if exists "aksi_asisten_milik_sendiri" on private.aksi_asisten;
create policy "aksi_asisten_milik_sendiri" on private.aksi_asisten using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists private.obrolan_asisten (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  judul_enc    bytea not null,
  pesan_enc    bytea not null,
  jumlah_pesan integer not null default 0,
  dibuat       timestamptz not null default now(),
  diubah       timestamptz not null default now()
);
create index if not exists idx_obrolan_asisten_user on private.obrolan_asisten (user_id, diubah desc);
alter table private.obrolan_asisten enable row level security;
revoke all on private.obrolan_asisten from anon, authenticated, service_role;
drop policy if exists "obrolan_asisten_milik_sendiri" on private.obrolan_asisten;
create policy "obrolan_asisten_milik_sendiri" on private.obrolan_asisten using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Pembantu ---------------------------------------------------------------

create or replace function private.panjang_larik(j jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(j) = 'array' then jsonb_array_length(j) else 0 end;
$$;
revoke execute on function private.panjang_larik(jsonb) from public, anon, authenticated;

-- Kantong dari isian usulan: "baru" = kantong yang dibuat usulan ini, selain
-- itu uuid kantong milik p_user (bukan deposito). p_uang: hanya kantong uang
-- (bank, e-wallet, tunai, tujuan tabungan, simpanan tabungan) — untuk pindah kantong.
create or replace function private.kantong_usulan(p_nilai text, p_baru uuid, p_user uuid, p_uang boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hasil uuid;
begin
  if p_nilai is null or p_nilai = '' then
    return null;
  end if;
  if p_nilai = 'baru' then
    if p_baru is null then
      raise exception 'Kantong barunya tidak ada di usulan ini.' using errcode = '22023';
    end if;
    return p_baru;
  end if;
  if p_nilai !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Kantongnya tidak ditemukan.' using errcode = '22023';
  end if;
  select a.id into hasil from public.user_accounts a
   where a.id = p_nilai::uuid and a.user_id = p_user
     and not (a.kind = 'simpanan' and a.macam_simpanan is not distinct from 'deposito')
     and (not p_uang or a.kind in ('bank', 'ewallet', 'cash', 'tujuan', 'simpanan'));
  if hasil is null then
    raise exception 'Kantongnya tidak ditemukan.' using errcode = '22023';
  end if;
  return hasil;
end;
$$;
revoke execute on function private.kantong_usulan(text, uuid, uuid, boolean) from public, anon, authenticated;

-- 3. Terapkan usulan --------------------------------------------------------
--
-- p: {
--   jenis: buat_kantong | jadikan_pindah | ubah_transaksi | hapus | selesaikan_draft | catat,
--   ringkasan: teks pendek (≤ 300),
--   kantong_baru?: { nama, jenis: bank|ewallet|cash, saldo_awal ≥ 0, saldo_sejak? },
--   ubah?:   [{ id, updated_at, isian: { amount?, transaction_date?, waktu?, category?, merchant?, description?, kantong_id?, kantong_tujuan_id? } }],
--   pindah?: [{ id, updated_at, ke: uuid|"baru", merchant?, gabung?: { id, updated_at } }],
--   hapus?:  [{ id, updated_at }],
--   draft?:  [{ id, updated_at, isian: { kantong_id?, kantong_tujuan_id?, waktu? } }],
--   sisip?:  [{ type, amount, category?, merchant?, description?, kantong_id, kantong_tujuan_id?, transaction_date, waktu?, teks? }]
-- }
-- Kantong boleh "baru" (kantong_baru di usulan yang sama). Paling banyak 200 baris (P5).
-- Hasil: { aksi_id, n, kantong_baru }.
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
  baru uuid;
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
     or jenis is null or jenis not in ('buat_kantong', 'jadikan_pindah', 'ubah_transaksi', 'hapus', 'selesaikan_draft', 'catat') then
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
    extensions.pgp_sym_encrypt(jsonb_build_object('kantong_baru', baru, 'langkah', langkah)::text, k, opsi),
    extensions.pgp_sym_encrypt(sesudah::text, k, opsi)
  )
  returning id into aksi;
  return jsonb_build_object('aksi_id', aksi, 'n', n, 'kantong_baru', baru);
exception
  when unique_violation then
    raise exception 'Datanya sudah berubah, minta usulan lagi.' using errcode = '22023';
  when foreign_key_violation then
    raise exception 'Kategori atau kantongnya tidak ditemukan.' using errcode = '22023';
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'Usulannya tidak valid.' using errcode = '22023';
end;
$$;

-- 4. Urungkan aksi ----------------------------------------------------------
--
-- Membalik persis, selama baris-baris yang diubah/dibuat belum diubah lagi
-- (updated_at sama dengan sesudah diterapkan). Tanpa batas waktu (P6).
-- Kantong yang dibuat usulan itu ikut dihapus bila tidak dipakai lagi.
-- Hasil: { n, kantong_dihapus }.
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
  kantong_dihapus boolean := false;
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

  update private.aksi_asisten set diurungkan_pada = now() where id = a.id;
  return jsonb_build_object('n', n, 'kantong_dihapus', kantong_dihapus);
exception
  when unique_violation then
    raise exception 'Datanya sudah berubah, jadi tidak bisa diurungkan.' using errcode = '22023';
end;
$$;

revoke execute on function public.terapkan_usulan(jsonb) from public, anon;
revoke execute on function public.urungkan_aksi(uuid) from public, anon;
grant execute on function public.terapkan_usulan(jsonb) to authenticated;
grant execute on function public.urungkan_aksi(uuid) to authenticated;

-- 5. Riwayat percakapan Tanya AI (P4) -----------------------------------------
--
-- Pesan disimpan utuh dari browser (pertanyaan, jawaban, tautan, kartu usulan
-- beserta keadaannya). Paling banyak 300 pesan & ±1,5 MB per percakapan.

create or replace function public.simpan_obrolan(p_id uuid, p_judul text, p_pesan jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  k text;
  opsi constant text := 'cipher-algo=aes256, s2k-mode=1';
  judul text := left(btrim(regexp_replace(coalesce(p_judul, ''), '\s+', ' ', 'g')), 80);
  hasil uuid;
begin
  if uid is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;
  if judul = '' or jsonb_typeof(p_pesan) is distinct from 'array' or jsonb_array_length(p_pesan) > 300 or length(p_pesan::text) > 1500000 then
    raise exception 'Percakapannya tidak valid.' using errcode = '22023';
  end if;
  k := private.kunci_transaksi();
  if p_id is null then
    insert into private.obrolan_asisten (user_id, judul_enc, pesan_enc, jumlah_pesan)
    values (uid, extensions.pgp_sym_encrypt(judul, k, opsi), extensions.pgp_sym_encrypt(p_pesan::text, k, opsi), jsonb_array_length(p_pesan))
    returning id into hasil;
  else
    update private.obrolan_asisten
       set judul_enc = extensions.pgp_sym_encrypt(judul, k, opsi),
           pesan_enc = extensions.pgp_sym_encrypt(p_pesan::text, k, opsi),
           jumlah_pesan = jsonb_array_length(p_pesan),
           diubah = now()
     where id = p_id and user_id = uid
    returning id into hasil;
    if hasil is null then
      raise exception 'Percakapannya tidak ditemukan.' using errcode = '22023';
    end if;
  end if;
  return hasil;
end;
$$;

create or replace function public.daftar_obrolan()
returns table (id uuid, judul text, jumlah_pesan integer, diubah timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, extensions.pgp_sym_decrypt(o.judul_enc, private.kunci_transaksi()), o.jumlah_pesan, o.diubah
    from private.obrolan_asisten o
   where o.user_id = auth.uid()
   order by o.diubah desc
   limit 100;
$$;

create or replace function public.buka_obrolan(p_id uuid)
returns table (id uuid, judul text, pesan jsonb, diubah timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, extensions.pgp_sym_decrypt(o.judul_enc, private.kunci_transaksi()),
         extensions.pgp_sym_decrypt(o.pesan_enc, private.kunci_transaksi())::jsonb, o.diubah
    from private.obrolan_asisten o
   where o.id = p_id and o.user_id = auth.uid();
$$;

create or replace function public.hapus_obrolan(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;
  delete from private.obrolan_asisten where id = p_id and user_id = auth.uid();
  return found;
end;
$$;

revoke execute on function public.simpan_obrolan(uuid, text, jsonb) from public, anon;
revoke execute on function public.daftar_obrolan() from public, anon;
revoke execute on function public.buka_obrolan(uuid) from public, anon;
revoke execute on function public.hapus_obrolan(uuid) from public, anon;
grant execute on function public.simpan_obrolan(uuid, text, jsonb) to authenticated;
grant execute on function public.daftar_obrolan() to authenticated;
grant execute on function public.buka_obrolan(uuid) to authenticated;
grant execute on function public.hapus_obrolan(uuid) to authenticated;

notify pgrst, 'reload schema';
