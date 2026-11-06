-- Simpanan: deposito & pocket di dalam kantong lain, dan tujuan tabungan yang
-- disimpan di kantong lain (docs/specs/SPEC-simpanan.md).

-- 1. Jenis kantong "simpanan", selalu di dalam kantong uang lain (induk).
alter table public.user_accounts drop constraint if exists user_accounts_kind_check;
alter table public.user_accounts
  add constraint user_accounts_kind_check
  check (kind in ('bank', 'ewallet', 'cash', 'orang', 'kredit', 'tujuan', 'simpanan'));

-- NO ACTION (bukan RESTRICT): dicek di akhir pernyataan, jadi menghapus akun
-- (cascade ke semua kantong sekaligus) tetap jalan. Induk yang masih punya
-- simpanan tetap tidak bisa dihapus.
alter table public.user_accounts add column if not exists induk_id uuid references public.user_accounts (id);
alter table public.user_accounts add column if not exists macam_simpanan text;
create index if not exists idx_user_accounts_induk on public.user_accounts (induk_id) where induk_id is not null;

alter table public.user_accounts drop constraint if exists user_accounts_simpanan_check;
alter table public.user_accounts
  add constraint user_accounts_simpanan_check
  check (
    (kind = 'simpanan') = (macam_simpanan is not null)
    and (macam_simpanan is null or macam_simpanan in ('tabungan', 'deposito'))
    and case when kind = 'simpanan' then induk_id is not null
             when kind = 'tujuan' then true
             else induk_id is null end
    and induk_id is distinct from id
  );

grant insert (induk_id, macam_simpanan) on public.user_accounts to authenticated;
grant update (induk_id) on public.user_accounts to authenticated;

-- Induk: kantong uang (bank/e-wallet/tunai) milik user yang sama.
create or replace function private.kantong_induk_cek()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.induk_id is not null and not exists (
    select 1 from public.user_accounts i
     where i.id = new.induk_id and i.user_id = new.user_id and i.kind in ('bank', 'ewallet', 'cash')
  ) then
    raise exception 'Simpanan hanya bisa di dalam bank, e-wallet, atau tunai milikmu' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.kantong_induk_cek() from public, anon, authenticated;

drop trigger if exists kantong_induk_cek on public.user_accounts;
create trigger kantong_induk_cek
  before insert or update of induk_id, kind on public.user_accounts
  for each row execute function private.kantong_induk_cek();

-- Induk dihapus: tujuan yang disimpan di sana dilepas (jadi terpisah), dan
-- deposito yang sudah selesai (tersembunyi, saldo 0) ikut dihapus.
-- Simpanan yang masih berjalan tetap menahan penghapusan (FK).
create or replace function private.induk_dihapus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Akun sedang dihapus (cascade dari auth.users): semua kantongnya ikut
  -- terhapus di perintah yang sama; mengubah baris saudaranya di sini justru
  -- membuat cascade gagal ("tuple already modified").
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  update public.user_accounts set induk_id = null
   where induk_id = old.id and user_id = old.user_id and kind = 'tujuan';
  delete from public.user_accounts k
   where k.induk_id = old.id and k.user_id = old.user_id and k.kind = 'simpanan'
     and exists (select 1 from public.deposito d where d.kantong_id = k.id and d.selesai);
  return old;
end;
$$;
revoke execute on function private.induk_dihapus() from public, anon, authenticated;

drop trigger if exists induk_dihapus on public.user_accounts;
create trigger induk_dihapus before delete on public.user_accounts for each row execute function private.induk_dihapus();

-- 2. Deposito: satu baris per kantong simpanan bermacam deposito.
create table if not exists public.deposito (
  kantong_id   uuid primary key references public.user_accounts (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bunga_persen numeric(5, 2) not null check (bunga_persen > 0 and bunga_persen <= 25),
  tenor        int not null,
  satuan_tenor text not null check (satuan_tenor in ('hari', 'bulan')),
  pajak_persen numeric(5, 2) not null check (pajak_persen between 0 and 100),
  perpanjangan text not null check (perpanjangan in ('sekali', 'pokok', 'pokok_bunga')),
  selesai      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (tenor between 1 and case satuan_tenor when 'hari' then 3660 else 120 end)
);
create index if not exists idx_deposito_user on public.deposito (user_id);

create table if not exists public.deposito_periode (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deposito_id     uuid not null references public.deposito (kantong_id) on delete cascade,
  ke              int not null check (ke >= 1),
  mulai           date not null,
  jatuh_tempo     date not null,
  pokok           numeric(14, 2) not null check (pokok > 0),
  bunga_kotor     numeric(14, 2) not null check (bunga_kotor >= 0),
  pajak           numeric(14, 2) not null check (pajak >= 0),
  bunga_bersih    numeric(14, 2) not null check (bunga_bersih >= 0),
  -- Hasil evaluasi: null = belum dicek user.
  bunga_diterima  numeric(14, 2) check (bunga_diterima >= 0),
  dievaluasi_pada timestamptz,
  dicairkan_awal  boolean not null default false,
  created_at      timestamptz not null default now(),
  check (jatuh_tempo > mulai),
  unique (deposito_id, ke)
);
create index if not exists idx_deposito_periode_user on public.deposito_periode (user_id);

drop trigger if exists isi_updated_at on public.deposito;
create trigger isi_updated_at before update on public.deposito for each row execute function private.isi_updated_at();

alter table public.deposito enable row level security;
alter table public.deposito_periode enable row level security;

-- Kolom milik & rujukan tidak bisa diubah sesudah dibuat.
revoke all on public.deposito, public.deposito_periode from anon, authenticated;
grant select, delete on public.deposito, public.deposito_periode to authenticated;
grant insert (kantong_id, user_id, bunga_persen, tenor, satuan_tenor, pajak_persen, perpanjangan)
  on public.deposito to authenticated;
grant update (bunga_persen, tenor, satuan_tenor, pajak_persen, perpanjangan, selesai)
  on public.deposito to authenticated;
grant insert (user_id, deposito_id, ke, mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih,
              bunga_diterima, dievaluasi_pada, dicairkan_awal)
  on public.deposito_periode to authenticated;
grant update (mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih, bunga_diterima, dievaluasi_pada, dicairkan_awal)
  on public.deposito_periode to authenticated;
grant select on public.deposito, public.deposito_periode to service_role;

-- Rujukan hanya ke milik sendiri (RLS user_accounts/deposito berlaku di subquery).
drop policy if exists "deposito_own" on public.deposito;
create policy "deposito_own"
  on public.deposito for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.user_accounts a
                 where a.id = kantong_id and a.kind = 'simpanan' and a.macam_simpanan = 'deposito')
  );

drop policy if exists "deposito_periode_own" on public.deposito_periode;
create policy "deposito_periode_own"
  on public.deposito_periode for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.deposito d where d.kantong_id = deposito_id)
  );

-- 3. Membuat simpanan dalam satu transaksi database. security invoker: tulis
--    lewat tabel & view biasa, jadi grant, RLS, dan trigger tulis transaksi
--    (enkripsi, pemeriksaan rujukan) tetap berlaku.
--    p_kantong: name, emoji, induk_id, macam_simpanan, saldo (≥ 0).
--    p_termasuk: uangnya sudah termasuk di saldo induk → saldo awal 0 lalu
--    pindah kantong induk → simpanan, bertanggal sekarang.
--    p_deposito: bunga_persen, tenor, satuan_tenor, pajak_persen, perpanjangan.
--    p_periode: periode ke-1 (mulai, jatuh_tempo, bunga_kotor, pajak, bunga_bersih),
--    dihitung aplikasi (src/lib/simpanan.ts); pokoknya = saldo.
create or replace function public.buat_simpanan(p_kantong jsonb, p_termasuk boolean, p_deposito jsonb default null, p_periode jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saldo numeric := coalesce((p_kantong ->> 'saldo')::numeric, 0);
  macam text := p_kantong ->> 'macam_simpanan';
  induk public.user_accounts;
  baru uuid;
  sekarang timestamptz := now();
  tanggal date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if saldo < 0 then
    raise exception 'Saldo simpanan tidak boleh minus' using errcode = '22023';
  end if;
  if macam = 'deposito' and (saldo <= 0 or p_deposito is null or p_periode is null) then
    raise exception 'Deposito butuh pokok, bunga, dan tenor' using errcode = '22023';
  end if;
  select * into induk from public.user_accounts where id = (p_kantong ->> 'induk_id')::uuid and user_id = auth.uid();
  if not found then
    raise exception 'Kantong induk tidak ditemukan' using errcode = 'P0002';
  end if;

  insert into public.user_accounts (user_id, name, emoji, kind, induk_id, macam_simpanan, saldo_awal, saldo_per, saldo_sejak)
  values (auth.uid(), p_kantong ->> 'name', p_kantong ->> 'emoji', 'simpanan', induk.id, macam,
          case when p_termasuk then 0 else saldo end, tanggal, date_trunc('minute', sekarang))
  returning id into baru;

  if macam = 'deposito' then
    insert into public.deposito (kantong_id, user_id, bunga_persen, tenor, satuan_tenor, pajak_persen, perpanjangan)
    values (baru, auth.uid(), (p_deposito ->> 'bunga_persen')::numeric, (p_deposito ->> 'tenor')::int,
            p_deposito ->> 'satuan_tenor', (p_deposito ->> 'pajak_persen')::numeric, p_deposito ->> 'perpanjangan');
    insert into public.deposito_periode (user_id, deposito_id, ke, mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih)
    values (auth.uid(), baru, 1, (p_periode ->> 'mulai')::date, (p_periode ->> 'jatuh_tempo')::date, saldo,
            (p_periode ->> 'bunga_kotor')::numeric, (p_periode ->> 'pajak')::numeric, (p_periode ->> 'bunga_bersih')::numeric);
  end if;

  -- Jam lengkap (detik), supaya tetap sesudah saldo induk yang baru diisi di menit yang sama.
  if p_termasuk and saldo > 0 then
    insert into public.transactions (user_id, amount, type, merchant, transaction_date, waktu, payment_method,
                                     kantong_id, kantong_tujuan_id, status, source)
    values (auth.uid(), saldo, 'transfer', p_kantong ->> 'name', tanggal, (sekarang at time zone 'Asia/Jakarta')::time,
            induk.name, induk.id, baru, 'confirmed', 'text');
  end if;
  return baru;
end;
$$;

-- 4. Menutup satu periode deposito: evaluasi jatuh tempo (bunga bersih yang
--    diterima user) atau Cairkan sekarang. p_cair: deposito berakhir (sekali
--    saja, atau dicairkan); selain itu diperpanjang dengan periode p_baru
--    (mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih) yang
--    dihitung aplikasi. Bunga > 0 → pemasukan (Bunga/Investasi) ke induk,
--    atau ke deposito itu sendiri bila diperpanjang dengan bunga. Cair →
--    seluruh saldo deposito pindah ke induk dan deposito selesai.
--    Mengembalikan saldo yang dipindah ke induk.
create or replace function public.tutup_periode_deposito(p_periode uuid, p_bunga numeric, p_cair boolean, p_keterangan text, p_baru jsonb default null)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  p public.deposito_periode;
  d public.deposito;
  k public.user_accounts;
  sekarang timestamptz := now();
  tanggal date := (now() at time zone 'Asia/Jakarta')::date;
  jam time := (now() at time zone 'Asia/Jakarta')::time;
  kategori text;
  sisa numeric := 0;
begin
  select * into p from public.deposito_periode where id = p_periode for update;
  if not found then
    raise exception 'Periode deposito tidak ditemukan' using errcode = 'P0002';
  end if;
  select * into d from public.deposito where kantong_id = p.deposito_id for update;
  select * into k from public.user_accounts where id = d.kantong_id;
  if d.selesai or p.bunga_diterima is not null or p.dicairkan_awal then
    raise exception 'Periode ini sudah dicek' using errcode = '22023';
  end if;
  if exists (select 1 from public.deposito_periode x where x.deposito_id = d.kantong_id and x.ke > p.ke) then
    raise exception 'Bukan periode terakhir' using errcode = '22023';
  end if;
  if coalesce(p_bunga, -1) < 0 then
    raise exception 'Bunga yang diterima tidak boleh minus' using errcode = '22023';
  end if;
  if not p_cair and (p.jatuh_tempo > tanggal or d.perpanjangan = 'sekali' or p_baru is null) then
    raise exception 'Deposito ini belum bisa diperpanjang' using errcode = '22023';
  end if;

  update public.deposito_periode set
    bunga_diterima = p_bunga,
    dievaluasi_pada = sekarang,
    dicairkan_awal = p_cair and tanggal < p.jatuh_tempo
  where id = p.id;

  if p_bunga > 0 then
    kategori := case when exists (select 1 from public.categories c where c.user_id = auth.uid() and c.type = 'income' and c.slug = 'investment')
                     then 'investment' else 'other' end;
    insert into public.transactions (user_id, amount, type, category, merchant, description, transaction_date, waktu,
                                     payment_method, kantong_id, status, source)
    values (auth.uid(), p_bunga, 'income', kategori, k.name, nullif(btrim(p_keterangan), ''), tanggal, jam,
            case when not p_cair and d.perpanjangan = 'pokok_bunga' then k.name
                 else (select i.name from public.user_accounts i where i.id = k.induk_id) end,
            case when not p_cair and d.perpanjangan = 'pokok_bunga' then k.id else k.induk_id end,
            'confirmed', 'text');
  end if;

  if p_cair then
    select s.saldo into sisa from public.saldo_kantong() s where s.id = k.id;
    if coalesce(sisa, 0) > 0 then
      insert into public.transactions (user_id, amount, type, merchant, transaction_date, waktu, payment_method,
                                       kantong_id, kantong_tujuan_id, status, source)
      values (auth.uid(), sisa, 'transfer', k.name, tanggal, jam, k.name, k.id, k.induk_id, 'confirmed', 'text');
    end if;
    update public.deposito set selesai = true where kantong_id = d.kantong_id;
  else
    insert into public.deposito_periode (user_id, deposito_id, ke, mulai, jatuh_tempo, pokok, bunga_kotor, pajak, bunga_bersih)
    values (auth.uid(), d.kantong_id, p.ke + 1, (p_baru ->> 'mulai')::date, (p_baru ->> 'jatuh_tempo')::date,
            (p_baru ->> 'pokok')::numeric, (p_baru ->> 'bunga_kotor')::numeric, (p_baru ->> 'pajak')::numeric,
            (p_baru ->> 'bunga_bersih')::numeric);
  end if;
  return coalesce(sisa, 0);
end;
$$;

-- 5. Hapus simpanan: saldonya kembali ke induk dulu (pindah kantong
--    bertanggal sekarang), lalu kantongnya dihapus. Mengembalikan saldo itu.
create or replace function public.hapus_simpanan(p_id uuid)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  k public.user_accounts;
  sisa numeric;
begin
  select * into k from public.user_accounts where id = p_id and user_id = auth.uid() and kind = 'simpanan' for update;
  if not found then
    raise exception 'Simpanan tidak ditemukan' using errcode = 'P0002';
  end if;
  select s.saldo into sisa from public.saldo_kantong() s where s.id = k.id;
  if coalesce(sisa, 0) > 0 then
    insert into public.transactions (user_id, amount, type, merchant, transaction_date, waktu, payment_method,
                                     kantong_id, kantong_tujuan_id, status, source)
    values (auth.uid(), sisa, 'transfer', k.name, (now() at time zone 'Asia/Jakarta')::date,
            (now() at time zone 'Asia/Jakarta')::time, k.name, k.id, k.induk_id, 'confirmed', 'text');
  end if;
  delete from public.user_accounts where id = k.id;
  return coalesce(sisa, 0);
end;
$$;

revoke execute on function public.buat_simpanan(jsonb, boolean, jsonb, jsonb) from public, anon;
revoke execute on function public.tutup_periode_deposito(uuid, numeric, boolean, text, jsonb) from public, anon;
revoke execute on function public.hapus_simpanan(uuid) from public, anon;
grant execute on function public.buat_simpanan(jsonb, boolean, jsonb, jsonb) to authenticated;
grant execute on function public.tutup_periode_deposito(uuid, numeric, boolean, text, jsonb) to authenticated;
grant execute on function public.hapus_simpanan(uuid) to authenticated;

-- 6. Data cron notifikasi: sama dengan 20261110000001_kantong_kartu.sql,
--    ditambah periode deposito yang belum dicek (push di hari jatuh temponya).
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
    ),
    'deposito', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nama', k.name, 'induk', i.name, 'jatuh_tempo', p.jatuh_tempo,
        'bunga_bersih', p.bunga_bersih)), '[]')
      from public.deposito_periode p
      join public.deposito d on d.kantong_id = p.deposito_id
      join public.user_accounts k on k.id = d.kantong_id
      left join public.user_accounts i on i.id = k.induk_id
      where p.user_id = u.user_id and not d.selesai and p.bunga_diterima is null and not p.dicairkan_awal
    )
  )), '[]')
  from (select distinct user_id from public.push_langganan) u;
$$;
revoke execute on function public.data_notifikasi() from public, anon, authenticated;
grant execute on function public.data_notifikasi() to service_role;

notify pgrst, 'reload schema';
