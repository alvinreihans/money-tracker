-- Isolasi rujukan antar akun (uji:isolasi). RLS sudah menutup baca/ubah/hapus
-- data akun lain, tapi kolom rujukan transaksi (pecahan_dari, induk_id,
-- kantong_id, …) menerima id milik akun lain, dan trigger salin/ikut yang
-- berjalan SECURITY DEFINER lalu menyalin isi baris itu (merchant, tanggal,
-- kantong) ke baris si penyisip, serta mengubah barisnya saat pemilik asli
-- mengedit. Butuh id (UUID) milik orang lain, tapi id itu tampil di alamat.

-- 1. -- Trigger tulis: sama dengan 20261108000000_fase4.sql, ditambah pemeriksaan rujukan.
create or replace function private.transactions_tulis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  opsi constant text := 'cipher-algo=aes256, s2k-mode=1';
begin
  if tg_op = 'DELETE' then
    delete from private.transaksi_data where id = old.id and user_id = auth.uid();
    return old;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'Transaksi ini bukan milikmu' using errcode = '42501';
  end if;
  -- Rujukan hanya ke data akun sendiri. Tanpa ini, id transaksi/kantong
  -- orang lain (mis. dari tautan /transactions/<id>) bisa dipasang di
  -- pecahan_dari dan trigger salin menyalin merchant & kantongnya.
  if exists (select 1 from private.transaksi_data r
              where r.id in (new.induk_id, new.pecahan_dari, new.pelengkap_tujuan, new.duplikat_dari)
                and r.user_id <> auth.uid())
     or exists (select 1 from public.user_accounts a
                 where a.id in (new.kantong_id, new.kantong_tujuan_id) and a.user_id <> auth.uid())
     or exists (select 1 from public.cicilan c where c.id = new.cicilan_id and c.user_id <> auth.uid()) then
    raise exception 'Rujukan ke data akun lain tidak diizinkan' using errcode = '42501';
  end if;
  k := private.kunci_transaksi();

  if tg_op = 'INSERT' then
    insert into private.transaksi_data (
      id, user_id, amount, type, category, merchant_enc, description_enc,
      transaction_date, created_at, payment_method, status, raw_ocr_text_enc,
      source, kantong_id, kantong_tujuan_id,
      induk_id, cicilan_id, cicilan_ke, waktu, paylater, duplikat_dari, bukti_transfer_enc,
      kelompok, pecahan_dari, pelengkap_tujuan, usulan_pecah_enc
    ) values (
      new.id, new.user_id, new.amount, new.type, new.category,
      extensions.pgp_sym_encrypt(new.merchant, k, opsi),
      extensions.pgp_sym_encrypt(new.description, k, opsi),
      new.transaction_date, new.created_at, new.payment_method, new.status,
      extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi),
      new.source, new.kantong_id,
      new.kantong_tujuan_id, new.induk_id, new.cicilan_id, new.cicilan_ke, new.waktu, new.paylater, new.duplikat_dari,
      extensions.pgp_sym_encrypt(new.bukti_transfer, k, opsi),
      new.kelompok, new.pecahan_dari, new.pelengkap_tujuan,
      extensions.pgp_sym_encrypt(new.usulan_pecah, k, opsi)
    );
    return new;
  end if;

  update private.transaksi_data set
    amount            = new.amount,
    type              = new.type,
    category          = new.category,
    merchant_enc      = case when new.merchant is not distinct from old.merchant then merchant_enc
                             else extensions.pgp_sym_encrypt(new.merchant, k, opsi) end,
    description_enc   = case when new.description is not distinct from old.description then description_enc
                             else extensions.pgp_sym_encrypt(new.description, k, opsi) end,
    transaction_date  = new.transaction_date,
    created_at        = new.created_at,
    payment_method    = new.payment_method,
    status            = new.status,
    raw_ocr_text_enc  = case when new.raw_ocr_text is not distinct from old.raw_ocr_text then raw_ocr_text_enc
                             else extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi) end,
    source            = new.source,
    kantong_id        = new.kantong_id,
    kantong_tujuan_id = new.kantong_tujuan_id,
    induk_id          = new.induk_id,
    cicilan_id        = new.cicilan_id,
    cicilan_ke        = new.cicilan_ke,
    waktu             = new.waktu,
    paylater          = new.paylater,
    duplikat_dari     = new.duplikat_dari,
    bukti_transfer_enc = case when new.bukti_transfer is not distinct from old.bukti_transfer then bukti_transfer_enc
                              else extensions.pgp_sym_encrypt(new.bukti_transfer, k, opsi) end,
    kelompok          = new.kelompok,
    pecahan_dari      = new.pecahan_dari,
    pelengkap_tujuan  = new.pelengkap_tujuan,
    -- Nominal berubah (edit, koreksi, jawaban draft, dipecah): usulan tidak lagi pas.
    usulan_pecah_enc  = case when new.amount is distinct from old.amount then null
                             when new.usulan_pecah is not distinct from old.usulan_pecah then usulan_pecah_enc
                             else extensions.pgp_sym_encrypt(new.usulan_pecah, k, opsi) end
  where id = old.id and user_id = auth.uid();
  return new;
end;
$$;
revoke execute on function private.transactions_tulis() from public, anon, authenticated;

-- 2. Trigger salin & ikut: hanya baris akun yang sama (lapis kedua).
create or replace function private.pecahan_salin_asli()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  asli private.transaksi_data;
begin
  select * into asli from private.transaksi_data where id = new.pecahan_dari and user_id = new.user_id;
  if found then
    new.transaction_date  := asli.transaction_date;
    new.waktu             := asli.waktu;
    new.created_at        := asli.created_at;
    new.kantong_id        := asli.kantong_id;
    new.kantong_tujuan_id := asli.kantong_tujuan_id;
    new.payment_method    := asli.payment_method;
    new.merchant_enc      := asli.merchant_enc;
    new.type              := asli.type;
    new.status            := asli.status;
  end if;
  return new;
end;
$$;
revoke execute on function private.pecahan_salin_asli() from public, anon, authenticated;

create or replace function private.pecahan_ikut_asli()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.transaksi_data set
    transaction_date  = new.transaction_date,
    waktu             = new.waktu,
    kantong_id        = new.kantong_id,
    kantong_tujuan_id = new.kantong_tujuan_id,
    payment_method    = new.payment_method,
    merchant_enc      = new.merchant_enc,
    type              = new.type,
    status            = new.status
  where pecahan_dari = new.id and user_id = new.user_id;
  return null;
end;
$$;
revoke execute on function private.pecahan_ikut_asli() from public, anon, authenticated;

create or replace function private.ikutan_salin_induk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  induk private.transaksi_data;
begin
  select * into induk from private.transaksi_data where id = new.induk_id and user_id = new.user_id;
  if found then
    new.transaction_date := induk.transaction_date;
    new.waktu := induk.waktu;
    new.created_at := induk.created_at;
  end if;
  return new;
end;
$$;
revoke execute on function private.ikutan_salin_induk() from public, anon, authenticated;

create or replace function private.ikutan_ikut_induk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.transaksi_data
     set transaction_date = new.transaction_date, waktu = new.waktu
   where induk_id = new.id
     and user_id = new.user_id
     and (transaction_date is distinct from new.transaction_date or waktu is distinct from new.waktu);
  return null;
end;
$$;
revoke execute on function private.ikutan_ikut_induk() from public, anon, authenticated;

-- 3. Rencana cicilan: kantong pembayarnya harus kantong sendiri (RLS
--    user_accounts berlaku di subquery, jadi kantong orang lain tidak terlihat).
drop policy if exists "cicilan_own" on public.cicilan;
create policy "cicilan_own"
  on public.cicilan for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (kantong_id is null or exists (select 1 from public.user_accounts a where a.id = kantong_id))
  );
