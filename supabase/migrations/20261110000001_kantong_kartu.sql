-- Kantong & kartu kredit (SPEC-perbaikan-temuan C3, C10).

-- 1. C3: nama kantong unik tanpa beda huruf besar-kecil & spasi tepi
--    ("BCA" vs "bca "). Sudah dicek: tidak ada data kembar di produksi.
create unique index if not exists idx_user_accounts_nama
  on public.user_accounts (user_id, lower(btrim(name)));

-- 2. C10: jatuh tempo tagihan kartu kredit tiap bulan (tanggal 1–31; bulan
--    yang lebih pendek mundur ke hari terakhirnya, dihitung di aplikasi).
alter table public.user_accounts add column if not exists jatuh_tempo_hari int;
alter table public.user_accounts drop constraint if exists user_accounts_jatuh_tempo_hari_check;
alter table public.user_accounts
  add constraint user_accounts_jatuh_tempo_hari_check
  check (jatuh_tempo_hari is null or (jatuh_tempo_hari between 1 and 31 and kind = 'kredit'));
grant select (jatuh_tempo_hari), insert (jatuh_tempo_hari), update (jatuh_tempo_hari) on public.user_accounts to authenticated;

-- 3. Data cron notifikasi: sama dengan 20261031000000_saldo_waktu.sql, ditambah jatuh_tempo_hari.
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
        'saldo_per', k.saldo_per, 'saldo_sejak', k.saldo_sejak, 'jatuh_tempo', k.jatuh_tempo,
        'jatuh_tempo_hari', k.jatuh_tempo_hari)), '[]')
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
