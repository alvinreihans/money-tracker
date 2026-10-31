-- Fase 4 (PETA-fase4.md): tawar pecah struk, kelompok baru, metode lanjutan,
-- strategi pelunasan. Satu migrasi untuk keempat modul.

-- 1. Kelompok baru (SPEC-kelompok-baru): pengembangan diri & tak terduga.
alter table public.categories drop constraint if exists categories_kelompok_check;
alter table public.categories
  add constraint categories_kelompok_check
  check (kelompok in ('kebutuhan', 'keinginan', 'tabungan', 'berbagi', 'pengembangan', 'tak_terduga'));

alter table private.transaksi_data drop constraint if exists transaksi_data_kelompok_check;
alter table private.transaksi_data
  add constraint transaksi_data_kelompok_check
  check (kelompok in ('kebutuhan', 'keinginan', 'tabungan', 'berbagi', 'pengembangan', 'tak_terduga'));

create or replace function private.kelompok_bawaan(slug text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when slug in ('food', 'groceries', 'transport', 'health', 'bills', 'fees') then 'kebutuhan'
    when slug = 'education' then 'pengembangan'
    -- Belanja, Hiburan, Lainnya, dan kategori buatan user yang tidak dikenal:
    -- diawasi sebagai keinginan sampai user memilih lain.
    else 'keinginan'
  end;
$$;
revoke execute on function private.kelompok_bawaan(text) from public, anon, authenticated;

-- Kategori bawaan: sama dengan KATEGORI_BAWAAN di src/lib/kategori.ts.
create or replace function public.seed_kategori_bawaan(uid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.categories (user_id, type, slug, name, icon, color, sort)
  values
    (uid, 'expense', 'food',          'Makan',            'utensils',        '#ff9f43', 1),
    (uid, 'expense', 'groceries',     'Belanja harian',   'shopping-basket', '#5ecb7a', 2),
    (uid, 'expense', 'transport',     'Transportasi',     'car',             '#3e91ff', 3),
    (uid, 'expense', 'shopping',      'Belanja',          'shopping-bag',    '#ff7a9c', 4),
    (uid, 'expense', 'health',        'Kesehatan',        'heart-pulse',     '#ff5f5f', 5),
    (uid, 'expense', 'entertainment', 'Hiburan',          'clapperboard',    '#bf7af0', 6),
    (uid, 'expense', 'bills',         'Tagihan',          'receipt',         '#4fc9e0', 7),
    (uid, 'expense', 'fees',          'Biaya admin',      'coins',           '#8fa3bf', 8),
    (uid, 'expense', 'education',     'Pendidikan',       'graduation-cap',  '#3e91ff', 9),
    (uid, 'expense', 'other',         'Lainnya',          'circle-ellipsis', '#9b9b9b', 99),
    (uid, 'income',  'salary',        'Gaji',             'briefcase',       '#5ecb7a', 1),
    (uid, 'income',  'bonus',         'Bonus/THR',        'sparkles',        '#5ecb7a', 2),
    (uid, 'income',  'business',      'Usaha/Jualan',     'store',           '#5ecb7a', 3),
    (uid, 'income',  'freelance',     'Freelance/Proyek', 'laptop',          '#5ecb7a', 4),
    (uid, 'income',  'gift',          'Pemberian',        'gift',            '#5ecb7a', 5),
    (uid, 'income',  'refund',        'Cashback/Refund',  'badge-percent',   '#5ecb7a', 6),
    (uid, 'income',  'investment',    'Bunga/Investasi',  'trending-up',     '#5ecb7a', 7),
    (uid, 'income',  'other',         'Lainnya',          'circle-ellipsis', '#9b9b9b', 99)
  on conflict do nothing;
$$;
revoke execute on function public.seed_kategori_bawaan(uuid) from public, anon, authenticated;

-- User lama: Pendidikan, kecuali yang sudah punya slug itu atau kategori
-- pengeluaran bernama "Pendidikan" buatan sendiri (idx_categories_nama unik
-- per nama). Kelompoknya diisi trigger kategori_kelompok lewat kelompok_bawaan.
insert into public.categories (user_id, type, slug, name, icon, color, sort)
select u.id, 'expense', 'education', 'Pendidikan', 'graduation-cap', '#3e91ff', 9
from auth.users u
where not exists (
  select 1 from public.categories c
  where c.user_id = u.id and c.type = 'expense' and (c.slug = 'education' or lower(btrim(c.name)) = 'pendidikan')
)
on conflict do nothing;

-- 2. Usulan pecah struk (SPEC-tawar-pecah): terenkripsi seperti keterangan,
--    karena berisi nama barang. Kosong lagi begitu nominalnya berubah.
alter table private.transaksi_data add column if not exists usulan_pecah_enc bytea;

-- View: sama dengan 20261107000000_normalisasi.sql, ditambah usulan_pecah di akhir.
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
  extensions.pgp_sym_decrypt(t.usulan_pecah_enc, (select private.kunci_transaksi())) as usulan_pecah
from private.transaksi_data t
where t.user_id = auth.uid();

-- Trigger tulis: sama dengan 20261107000000_normalisasi.sql, ditambah usulan_pecah.
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

-- 3. Metode lanjutan (SPEC-metode-lanjutan) & strategi pelunasan (SPEC-pelunasan).
--    Default metode supaya Utang & Piutang bisa menyimpan strategi tanpa menyentuh metode.
alter table public.metode_budget drop constraint if exists metode_budget_metode_check;
alter table public.metode_budget
  add constraint metode_budget_metode_check
  check (metode in ('kategori', '50-30-20', '80-20', '70-20-10', 'kustom', 'zero-based', 'pyf', '6-jars', 'kakeibo'));
alter table public.metode_budget alter column metode set default 'kategori';

-- Zero-Based & Kakeibo: target tabungan per bulan dalam rupiah.
alter table public.metode_budget add column if not exists target_tabungan numeric(14, 2)
  check (target_tabungan > 0);
alter table public.metode_budget add column if not exists strategi_utang text
  check (strategi_utang in ('snowball', 'avalanche'));
alter table public.metode_budget add column if not exists ekstra_utang numeric(14, 2)
  check (ekstra_utang > 0);

-- 4. Bunga per bulan (%) untuk urutan Avalanche: hanya utang ke orang & kartu kredit, dan cicilan.
alter table public.user_accounts add column if not exists bunga_persen numeric(4, 2);
alter table public.user_accounts drop constraint if exists user_accounts_bunga_check;
alter table public.user_accounts
  add constraint user_accounts_bunga_check
  check (bunga_persen is null or (bunga_persen between 0 and 10 and kind in ('orang', 'kredit')));
grant select (bunga_persen), insert (bunga_persen), update (bunga_persen) on public.user_accounts to authenticated;

alter table public.cicilan add column if not exists bunga_persen numeric(4, 2)
  check (bunga_persen is null or bunga_persen between 0 and 10);
