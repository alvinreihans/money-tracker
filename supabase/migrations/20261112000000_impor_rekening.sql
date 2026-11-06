-- Impor rekening koran (docs/specs/SPEC-impor-rekening.md), dan kolom yang
-- disiapkan untuk SPEC-lengkapi. Hanya menambah: kolom baru, indeks, view &
-- trigger tulis yang ditulis ulang utuh (pola SPEC-enkripsi), dan dua RPC.

-- 1. Kantong: 4 digit akhir nomor rekening, supaya rekening koran berikutnya
--    langsung masuk ke kantong yang sama (tidak ditanya lagi).
alter table public.user_accounts add column if not exists nomor_akhir text;
alter table public.user_accounts drop constraint if exists user_accounts_nomor_akhir_check;
alter table public.user_accounts
  add constraint user_accounts_nomor_akhir_check check (nomor_akhir is null or nomor_akhir ~ '^[0-9]{4}$');
create index if not exists idx_user_accounts_nomor_akhir on public.user_accounts (user_id, nomor_akhir) where nomor_akhir is not null;
grant insert (nomor_akhir), update (nomor_akhir) on public.user_accounts to authenticated;

-- 2. Transaksi:
--    - ref_bank: pengenal baris rekening koran (sisi asal untuk pindah kantong),
--      ref_bank_tujuan: sisi tujuan pindah kantong antar rekening sendiri.
--      Unik per user, jadi impor ulang / berkas tumpang tindih tidak menggandakan.
--    - perlu_dilengkapi: tercatat dari rekening koran tanpa kategori/merchant
--      yang jelas (K3); hilang saat dilengkapi (SPEC-lengkapi).
--    - ref_bukti: Order SN / nomor bon (SPEC-lengkapi §5; diisi fase 2).
alter table private.transaksi_data add column if not exists ref_bank text;
alter table private.transaksi_data add column if not exists ref_bank_tujuan text;
alter table private.transaksi_data add column if not exists perlu_dilengkapi boolean not null default false;
alter table private.transaksi_data add column if not exists ref_bukti text;
alter table private.transaksi_data drop constraint if exists transaksi_data_ref_check;
alter table private.transaksi_data
  add constraint transaksi_data_ref_check
  check (length(ref_bank) <= 200 and length(ref_bank_tujuan) <= 200 and length(ref_bukti) <= 200);
create unique index if not exists idx_transaksi_ref_bank on private.transaksi_data (user_id, ref_bank) where ref_bank is not null;
create unique index if not exists idx_transaksi_ref_bank_tujuan on private.transaksi_data (user_id, ref_bank_tujuan) where ref_bank_tujuan is not null;
create index if not exists idx_transaksi_perlu_dilengkapi on private.transaksi_data (user_id) where perlu_dilengkapi;

-- View: sama dengan 20261108000000_fase4.sql, ditambah empat kolom di akhir.
create or replace view public.transactions with (security_barrier) as
select
  t.id,
  t.user_id,
  t.amount,
  t.type,
  -- Pindah kantong tidak berkategori di penyimpanan; aplikasi tetap melihat "other".
  coalesce(t.category, 'other') as category,
  extensions.pgp_sym_decrypt(t.merchant_enc, (select private.kunci_transaksi())) as merchant,
  extensions.pgp_sym_decrypt(t.description_enc, (select private.kunci_transaksi())) as description,
  t.transaction_date,
  t.created_at,
  -- Nama kantong saat ini; teks tersimpan hanya untuk yang belum/tidak lagi berkantong.
  coalesce((select a.name from public.user_accounts a where a.id = t.kantong_id), t.payment_method) as payment_method,
  t.status,
  extensions.pgp_sym_decrypt(t.raw_ocr_text_enc, (select private.kunci_transaksi())) as raw_ocr_text,
  t.source,
  t.kantong_id,
  t.kantong_tujuan_id,
  t.induk_id,
  t.cicilan_id,
  t.cicilan_ke,
  t.waktu,
  t.paylater,
  t.duplikat_dari,
  extensions.pgp_sym_decrypt(t.bukti_transfer_enc, (select private.kunci_transaksi())) as bukti_transfer,
  t.kelompok,
  t.pecahan_dari,
  -- Kelompok yang berlaku: pilihan transaksi itu, atau bawaan kategorinya.
  case when t.type = 'expense' then coalesce(
    t.kelompok,
    (select c.kelompok from public.categories c where c.user_id = t.user_id and c.type = 'expense' and c.slug = t.category),
    'keinginan'
  ) end as kelompok_efektif,
  t.pelengkap_tujuan,
  t.updated_at,
  extensions.pgp_sym_decrypt(t.usulan_pecah_enc, (select private.kunci_transaksi())) as usulan_pecah,
  t.ref_bank,
  t.ref_bank_tujuan,
  t.perlu_dilengkapi,
  t.ref_bukti
from private.transaksi_data t
where t.user_id = auth.uid();

alter view public.transactions alter column perlu_dilengkapi set default false;

-- Trigger tulis: sama dengan 20261109000000_isolasi_rujukan.sql, ditambah empat kolom.
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
      kelompok, pecahan_dari, pelengkap_tujuan, usulan_pecah_enc,
      ref_bank, ref_bank_tujuan, perlu_dilengkapi, ref_bukti
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
      extensions.pgp_sym_encrypt(new.usulan_pecah, k, opsi),
      new.ref_bank, new.ref_bank_tujuan, coalesce(new.perlu_dilengkapi, false), new.ref_bukti
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
                             else extensions.pgp_sym_encrypt(new.usulan_pecah, k, opsi) end,
    ref_bank          = new.ref_bank,
    ref_bank_tujuan   = new.ref_bank_tujuan,
    perlu_dilengkapi  = coalesce(new.perlu_dilengkapi, false),
    ref_bukti         = new.ref_bukti
  where id = old.id and user_id = auth.uid();
  return new;
end;
$$;
revoke execute on function private.transactions_tulis() from public, anon, authenticated;

-- 3. Pengenal baris yang sudah tersimpan (pratinjau). Lewat body RPC, bukan
--    filter URL: satu rekening koran bisa ratusan pengenal.
create or replace function public.ref_bank_ada(p_ref text[])
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select t.ref_bank from public.transactions t where t.ref_bank = any (p_ref)
  union
  select t.ref_bank_tujuan from public.transactions t where t.ref_bank_tujuan = any (p_ref);
$$;
revoke execute on function public.ref_bank_ada(text[]) from public, anon;
grant execute on function public.ref_bank_ada(text[]) to authenticated;

-- 4. Impor dalam satu transaksi database (semua atau tidak sama sekali).
--    security invoker: tulis lewat tabel & view biasa, jadi grant, RLS, dan
--    trigger tulis transaksi (enkripsi, pemeriksaan rujukan) tetap berlaku.
--    Rencananya dihitung aplikasi (src/lib/rekening/rencana.ts); kantong &
--    transaksi baru dirujuk dengan kunci sementara ("baru:…", "t0") yang di
--    sini diganti id sebenarnya.
--    p: kantong_baru[], nomor_akhir[], deposito_baru[], saldo[], sisip[],
--       tautkan[], perbarui[]  (bentuknya: tipe Rencana di rencana.ts).
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
  exception when unique_violation then
    raise exception 'Sebagian baris rekening koran ini sudah diimpor barusan. Buka pratinjaunya lagi.' using errcode = '23505';
  end;

  return jsonb_build_object('kantong', n_kantong, 'transaksi', n_sisip, 'tautan', n_tautan);
end;
$$;
revoke execute on function public.impor_rekening(jsonb) from public, anon;
grant execute on function public.impor_rekening(jsonb) to authenticated;
