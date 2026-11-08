-- =============================================================
-- Migration: periksa dulu & "Cara dicatat" (docs/specs/SPEC-periksa-dulu.md, disetujui 9 Nov 2026)
--
-- Hasil Catat kini selalu jadi draft dulu (dicek di kartu "Periksa dulu"),
-- dan setiap transaksi yang dibuat lewat Catat menyimpan jejak pencatatannya:
-- asal, teks/ringkasan hasil baca AI, tanya-jawab, koreksi, waktu Simpan, dan
-- thumbnail gambarnya (K1). Terenkripsi dengan kunci Vault yang sama dengan
-- teks transaksi (SPEC-enkripsi) dan ikut terhapus bersama transaksinya.
-- =============================================================

-- 1. Jejak sementara selama masih draft: asal & hasil baca, lalu tiap
--    tanya-jawab ditambahkan. Ikut hilang bersama baris draft-nya.
alter table private.draft_catat add column if not exists jejak_enc bytea;

-- 2. Jejak per transaksi. Boleh lebih dari satu baris: Simpan, lalu Lengkapi
--    dari gambar lain atau koreksi lewat ketikan menambah baris baru.
create table if not exists private.jejak_catat (
  id           bigint generated always as identity primary key,
  transaksi_id uuid not null references private.transaksi_data (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  isi_enc      bytea not null,
  foto_enc     bytea,
  dibuat       timestamptz not null default now()
);
create index if not exists idx_jejak_catat_transaksi on private.jejak_catat (transaksi_id);
alter table private.jejak_catat enable row level security;
revoke all on private.jejak_catat from anon, authenticated, service_role;

-- Gabungan dua isi jejak: kunci biasa ditimpa yang baru, `langkah` disambung
-- (paling banyak 60 langkah terakhir).
create or replace function private.gabung_jejak(p_lama jsonb, p_baru jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select (coalesce(p_lama, '{}'::jsonb) - 'langkah') || (coalesce(p_baru, '{}'::jsonb) - 'langkah') ||
    jsonb_build_object('langkah', coalesce((
      select jsonb_agg(x.v order by x.n)
      from (
        select v, n from jsonb_array_elements(
          case when jsonb_typeof(p_lama -> 'langkah') = 'array' then p_lama -> 'langkah' else '[]'::jsonb end ||
          case when jsonb_typeof(p_baru -> 'langkah') = 'array' then p_baru -> 'langkah' else '[]'::jsonb end
        ) with ordinality as e(v, n)
        order by n desc
        limit 60
      ) x
    ), '[]'::jsonb));
$$;
revoke execute on function private.gabung_jejak(jsonb, jsonb) from public, anon, authenticated;

-- 3. Tambah ke jejak draft (asal & hasil baca saat dibuat, tanya-jawab sesudahnya).
create or replace function public.catat_jejak_draft(p_id uuid, p_tambah jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := private.kunci_transaksi();
begin
  if p_tambah is null or jsonb_typeof(p_tambah) <> 'object' or length(p_tambah::text) > 20000 then
    raise exception 'Isi jejak tidak valid' using errcode = '22023';
  end if;
  update private.draft_catat
     set jejak_enc = extensions.pgp_sym_encrypt(
           private.gabung_jejak(
             case when jejak_enc is null then null else extensions.pgp_sym_decrypt(jejak_enc, k)::jsonb end,
             p_tambah)::text,
           k, 'cipher-algo=aes256, s2k-mode=1')
   where transaksi_id = p_id and user_id = auth.uid();
  return found;
end;
$$;

-- 4. Jejak transaksi: isi (digabung dengan jejak draft-nya bila ada) dan foto:
--    p_foto (base64 WebP, mis. gambar pelengkap Lengkapi), atau thumbnail draft
--    yang dipindah (K1). p_dari: draft lain yang jejak & fotonya dipindah ke
--    transaksi ini ("Lengkapi yang sudah ada"). Hanya untuk transaksi milik sendiri.
create or replace function public.tambah_jejak(p_id uuid, p_isi jsonb, p_foto text default null, p_dari uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  d record;
  isi jsonb;
begin
  if p_isi is null or jsonb_typeof(p_isi) <> 'object' or length(p_isi::text) > 20000 then
    raise exception 'Isi jejak tidak valid' using errcode = '22023';
  end if;
  if p_foto is not null and length(p_foto) > 400000 then
    raise exception 'Foto terlalu besar' using errcode = '22023';
  end if;
  if not exists (select 1 from private.transaksi_data where id = p_id and user_id = auth.uid()) then
    return false;
  end if;
  k := private.kunci_transaksi();
  select jejak_enc, foto_enc into d from private.draft_catat where transaksi_id = coalesce(p_dari, p_id) and user_id = auth.uid();
  isi := case when d.jejak_enc is null then p_isi else private.gabung_jejak(extensions.pgp_sym_decrypt(d.jejak_enc, k)::jsonb, p_isi) end;
  insert into private.jejak_catat (transaksi_id, user_id, isi_enc, foto_enc)
  values (
    p_id,
    auth.uid(),
    extensions.pgp_sym_encrypt(isi::text, k, 'cipher-algo=aes256, s2k-mode=1'),
    case when p_foto is not null
      then extensions.pgp_sym_encrypt_bytea(decode(p_foto, 'base64'), k, 'cipher-algo=aes256, s2k-mode=1')
      else d.foto_enc end
  );
  return true;
end;
$$;

-- 5. Baca jejak transaksi (tanpa fotonya; foto diambil per baris).
create or replace function public.jejak_catat(p_id uuid)
returns table (id bigint, isi jsonb, ada_foto boolean, dibuat timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, extensions.pgp_sym_decrypt(j.isi_enc, private.kunci_transaksi())::jsonb, j.foto_enc is not null, j.dibuat
  from private.jejak_catat j
  where j.transaksi_id = p_id and j.user_id = auth.uid()
  order by j.dibuat, j.id;
$$;

create or replace function public.foto_jejak(p_id bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select translate(encode(extensions.pgp_sym_decrypt_bytea(foto_enc, private.kunci_transaksi()), 'base64'), E'\n', '')
  from private.jejak_catat
  where id = p_id and user_id = auth.uid() and foto_enc is not null;
$$;

-- 6. Urungkan Simpan (Simpan semua → Urungkan): transaksinya sudah kembali jadi
--    draft; jejak & thumbnail Simpan terakhir dikembalikan ke draft-nya.
create or replace function public.urungkan_jejak(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  j record;
begin
  select id, isi_enc, foto_enc into j from private.jejak_catat
   where transaksi_id = p_id and user_id = auth.uid()
   order by id desc limit 1;
  if j.id is null then
    return false;
  end if;
  update private.draft_catat
     set jejak_enc = j.isi_enc, foto_enc = coalesce(foto_enc, j.foto_enc)
   where transaksi_id = p_id and user_id = auth.uid();
  if not found then
    return false;
  end if;
  delete from private.jejak_catat where id = j.id;
  return true;
end;
$$;

revoke execute on function public.catat_jejak_draft(uuid, jsonb) from public, anon;
revoke execute on function public.tambah_jejak(uuid, jsonb, text, uuid) from public, anon;
revoke execute on function public.jejak_catat(uuid) from public, anon;
revoke execute on function public.foto_jejak(bigint) from public, anon;
revoke execute on function public.urungkan_jejak(uuid) from public, anon;
grant execute on function public.catat_jejak_draft(uuid, jsonb) to authenticated;
grant execute on function public.tambah_jejak(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.jejak_catat(uuid) to authenticated;
grant execute on function public.foto_jejak(bigint) to authenticated;
grant execute on function public.urungkan_jejak(uuid) to authenticated;

notify pgrst, 'reload schema';
