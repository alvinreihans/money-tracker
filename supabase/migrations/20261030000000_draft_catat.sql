-- =============================================================
-- Migration: catat sebagai obrolan (SPEC-catat-chat.md, disetujui 23 Okt 2026)
--
-- Draft (transaksi berstatus needs_review) kini jadi "percakapan" yang bisa
-- dilanjutkan, beserta thumbnail struknya (terenkripsi). Selesai dilengkapi
-- (status confirmed) atau dihapus → baris & fotonya hilang. Umur maks 30 hari.
-- =============================================================

-- 1. Satu baris per draft. Thumbnail WebP ±720 px, dienkripsi dengan kunci
--    Vault yang sama dengan teks transaksi.
create table if not exists private.draft_catat (
  transaksi_id uuid primary key references private.transaksi_data (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  foto_enc     bytea,
  dibuat       timestamptz not null default now()
);
alter table private.draft_catat enable row level security;
revoke all on private.draft_catat from anon, authenticated, service_role;

-- 2. Disinkronkan oleh trigger di tabel transaksi, bukan oleh aplikasi: tidak
--    mungkin ada foto yatim atau draft tanpa barisnya. Transaksi ikutan
--    (biaya admin/cashback) ikut status induknya tapi bukan percakapan sendiri.
create or replace function private.sinkron_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'needs_review' and new.induk_id is null then
    insert into private.draft_catat (transaksi_id, user_id) values (new.id, new.user_id)
    on conflict (transaksi_id) do nothing;
  else
    delete from private.draft_catat where transaksi_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function private.sinkron_draft() from public, anon, authenticated;

drop trigger if exists sinkron_draft on private.transaksi_data;
create trigger sinkron_draft
  after insert or update of status, induk_id on private.transaksi_data
  for each row execute function private.sinkron_draft();

-- Draft yang sudah ada: umurnya dihitung mulai sekarang.
insert into private.draft_catat (transaksi_id, user_id)
select id, user_id from private.transaksi_data where status = 'needs_review' and induk_id is null
on conflict (transaksi_id) do nothing;

-- 3. Daftar percakapan milik user (tanpa fotonya; foto diambil per draft).
create or replace view public.draft_catat with (security_barrier) as
select d.transaksi_id, d.dibuat, d.foto_enc is not null as ada_foto
from private.draft_catat d
where d.user_id = auth.uid();
revoke all on public.draft_catat from anon, authenticated, service_role;
grant select on public.draft_catat to authenticated;

-- 4. Foto: disimpan & dibaca lewat fungsi (enkripsi di database). Base64
--    karena lebih mudah lewat JSON PostgREST daripada bytea.
create or replace function public.simpan_foto_draft(p_id uuid, p_foto text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ±300 KB gambar; thumbnail sebenarnya ±50 KB.
  if length(p_foto) > 400000 then
    raise exception 'Foto terlalu besar' using errcode = '22023';
  end if;
  update private.draft_catat
     set foto_enc = extensions.pgp_sym_encrypt_bytea(decode(p_foto, 'base64'), private.kunci_transaksi(), 'cipher-algo=aes256, s2k-mode=1')
   where transaksi_id = p_id and user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.foto_draft(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- encode(base64) menyisipkan baris baru tiap 76 karakter; dibuang.
  select translate(encode(extensions.pgp_sym_decrypt_bytea(foto_enc, private.kunci_transaksi()), 'base64'), E'\n', '')
  from private.draft_catat
  where transaksi_id = p_id and user_id = auth.uid() and foto_enc is not null;
$$;

revoke execute on function public.simpan_foto_draft(uuid, text) from public, anon;
revoke execute on function public.foto_draft(uuid) from public, anon;
grant execute on function public.simpan_foto_draft(uuid, text) to authenticated;
grant execute on function public.foto_draft(uuid) to authenticated;

-- 5. Cron harian: hapus draft yang lewat 30 hari (beserta fotonya, cascade).
create or replace function public.hapus_draft_kedaluwarsa()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from private.transaksi_data t
   using private.draft_catat d
   where d.transaksi_id = t.id and d.dibuat < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.hapus_draft_kedaluwarsa() from public, anon, authenticated;
grant execute on function public.hapus_draft_kedaluwarsa() to service_role;

-- 6. Data cron notifikasi: tambahkan draft (untuk pengingat H+1 & H+7).
--    Tetap tanpa kolom teks terenkripsi.
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
        'saldo_per', k.saldo_per, 'jatuh_tempo', k.jatuh_tempo)), '[]')
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
        'created_at', t.created_at, 'kantong_id', t.kantong_id,
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
