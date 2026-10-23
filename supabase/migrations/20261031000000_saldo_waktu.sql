-- =============================================================
-- Migration: saldo per jam & jam transaksi (SPEC-saldo-waktu.md,
-- disetujui 23 Okt 2026)
--
-- Saldo kantong berlaku sejak jam tertentu (saldo_sejak), bukan hanya
-- tanggal; transaksi boleh punya jam (waktu). Di hari yang sama, transaksi
-- sebelum jam saldo tidak memotong saldo (sudah termasuk di angkanya).
-- =============================================================

-- 1. Kantong: saldo_sejak (sumber kebenaran). saldo_per tetap ada = tanggal
--    WIB dari saldo_sejak, supaya kode & data lama tetap jalan.
alter table public.user_accounts add column if not exists saldo_sejak timestamptz;

-- Data lama: 00.00 WIB tanggal saldo_per → hasil hitung tidak berubah.
update public.user_accounts
   set saldo_sejak = (saldo_per::timestamp at time zone 'Asia/Jakarta')
 where saldo_sejak is null;

-- Disinkronkan trigger, jadi jalur mana pun yang hanya menulis saldo_per
-- (kantong orang/kartu, kode lama) tetap benar.
create or replace function public.sinkron_saldo_sejak()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.saldo_sejak is null then
      new.saldo_sejak := new.saldo_per::timestamp at time zone 'Asia/Jakarta';
    else
      new.saldo_per := (new.saldo_sejak at time zone 'Asia/Jakarta')::date;
    end if;
  elsif new.saldo_sejak is distinct from old.saldo_sejak then
    new.saldo_per := (new.saldo_sejak at time zone 'Asia/Jakarta')::date;
  elsif new.saldo_per is distinct from old.saldo_per then
    new.saldo_sejak := new.saldo_per::timestamp at time zone 'Asia/Jakarta';
  end if;
  return new;
end;
$$;
revoke execute on function public.sinkron_saldo_sejak() from public, anon, authenticated;

drop trigger if exists sinkron_saldo_sejak on public.user_accounts;
create trigger sinkron_saldo_sejak
  before insert or update of saldo_sejak, saldo_per on public.user_accounts
  for each row execute function public.sinkron_saldo_sejak();

alter table public.user_accounts alter column saldo_sejak set not null;
grant insert (saldo_sejak) on public.user_accounts to authenticated;
grant update (saldo_sejak) on public.user_accounts to authenticated;

-- 2. Transaksi: jam terjadinya (WIB), opsional.
alter table private.transaksi_data add column if not exists waktu time;

-- View: kolom baru di akhir (create or replace view hanya boleh menambah di
-- akhir) — default & grant view tetap.
create or replace view public.transactions with (security_barrier) as
select
  t.id,
  t.user_id,
  t.amount,
  t.type,
  t.category,
  extensions.pgp_sym_decrypt(t.merchant_enc, (select private.kunci_transaksi())) as merchant,
  extensions.pgp_sym_decrypt(t.description_enc, (select private.kunci_transaksi())) as description,
  t.transaction_date,
  t.created_at,
  t.payment_method,
  t.status,
  extensions.pgp_sym_decrypt(t.raw_ocr_text_enc, (select private.kunci_transaksi())) as raw_ocr_text,
  t.account,
  t.counterparty,
  t.source,
  t.external_id,
  t.kantong_id,
  t.kantong_tujuan_id,
  t.induk_id,
  t.cicilan_id,
  t.cicilan_ke,
  t.waktu
from private.transaksi_data t
where t.user_id = auth.uid();

-- Trigger tulis: sama seperti 20261027000000_enkripsi.sql, ditambah waktu.
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
      account, counterparty, source, external_id, kantong_id, kantong_tujuan_id,
      induk_id, cicilan_id, cicilan_ke, waktu
    ) values (
      new.id, new.user_id, new.amount, new.type, new.category,
      extensions.pgp_sym_encrypt(new.merchant, k, opsi),
      extensions.pgp_sym_encrypt(new.description, k, opsi),
      new.transaction_date, new.created_at, new.payment_method, new.status,
      extensions.pgp_sym_encrypt(new.raw_ocr_text, k, opsi),
      new.account, new.counterparty, new.source, new.external_id, new.kantong_id,
      new.kantong_tujuan_id, new.induk_id, new.cicilan_id, new.cicilan_ke, new.waktu
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
    account           = new.account,
    counterparty      = new.counterparty,
    source            = new.source,
    external_id       = new.external_id,
    kantong_id        = new.kantong_id,
    kantong_tujuan_id = new.kantong_tujuan_id,
    induk_id          = new.induk_id,
    cicilan_id        = new.cicilan_id,
    cicilan_ke        = new.cicilan_ke,
    waktu             = new.waktu
  where id = old.id and user_id = auth.uid();
  return new;
end;
$$;
revoke execute on function private.transactions_tulis() from public, anon, authenticated;

-- 3. Saldo: di hari saldo_sejak, transaksi sebelum jamnya tidak dihitung.
--    Tanpa jam = dianggap sesudah (data lama & isian tanpa jam). Aturan sama
--    dengan hitungSaldo (src/lib/kantong.ts).
create or replace function public.saldo_kantong()
returns table (id uuid, saldo numeric)
language sql
stable
set search_path = ''
as $$
  select
    k.id,
    k.saldo_awal + coalesce(sum(
      case when t.kantong_id = k.id then
        case t.type when 'income' then t.amount when 'expense' then -t.amount when 'transfer' then -t.amount else 0 end
      else 0 end
      + case when t.kantong_tujuan_id = k.id and t.type = 'transfer' then t.amount else 0 end
    ), 0)
  from public.user_accounts k
  left join public.transactions t
    on (t.kantong_id = k.id or t.kantong_tujuan_id = k.id)
   and t.status = 'confirmed'
   and (
     t.transaction_date > k.saldo_per
     or (t.transaction_date = k.saldo_per
         and (t.waktu is null or t.waktu >= (k.saldo_sejak at time zone 'Asia/Jakarta')::time))
   )
  where k.user_id = auth.uid()
  group by k.id, k.saldo_awal;
$$;
revoke execute on function public.saldo_kantong() from public, anon;
grant execute on function public.saldo_kantong() to authenticated;

-- 4. Data cron notifikasi: saldo_sejak kantong & jam transaksi (hitungSaldo).
create or replace function public.data_notifikasi()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.user_id,
    'langganan', (
      select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
      from public.push_langganan p where p.user_id = u.user_id
    ),
    'kantong', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'kind', k.kind, 'saldo_awal', k.saldo_awal,
        'saldo_per', k.saldo_per, 'saldo_sejak', k.saldo_sejak, 'jatuh_tempo', k.jatuh_tempo)), '[]')
      from public.user_accounts k where k.user_id = u.user_id and k.kind in ('orang', 'kredit')
    ),
    'cicilan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'nama', c.nama, 'nominal', c.nominal, 'tenor', c.tenor,
        'jatuh_tempo_awal', c.jatuh_tempo_awal)), '[]')
      from public.cicilan c where c.user_id = u.user_id
    ),
    'transaksi', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'amount', t.amount, 'type', t.type, 'transaction_date', t.transaction_date,
        'waktu', t.waktu, 'created_at', t.created_at, 'kantong_id', t.kantong_id,
        'kantong_tujuan_id', t.kantong_tujuan_id, 'cicilan_id', t.cicilan_id,
        'cicilan_ke', t.cicilan_ke)), '[]')
      from private.transaksi_data t
      where t.user_id = u.user_id
        and t.status = 'confirmed'
        and (t.cicilan_id is not null
          or t.created_at > now() - interval '2 days'
          or exists (
            select 1 from public.user_accounts k
            where k.id in (t.kantong_id, t.kantong_tujuan_id) and k.kind in ('orang', 'kredit')))
    ),
    'draft', (
      select coalesce(jsonb_agg(jsonb_build_object('id', d.transaksi_id, 'dibuat', d.dibuat, 'source', t.source)), '[]')
      from private.draft_catat d join private.transaksi_data t on t.id = d.transaksi_id
      where d.user_id = u.user_id
    )
  )), '[]')
  from (select distinct user_id from public.push_langganan) u;
$$;
revoke execute on function public.data_notifikasi() from public, anon, authenticated;
grant execute on function public.data_notifikasi() to service_role;

notify pgrst, 'reload schema';
