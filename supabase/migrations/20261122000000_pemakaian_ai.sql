-- =============================================================
-- Migration: pemakaian model AI harian (docs/specs/SPEC-asisten-agen.md §1, P9)
--
-- Tanya AI memakai model besar (GEMINI_MODEL_BERAT) untuk pertanyaan berat.
-- Jatah harian model itu belum diketahui (P9), jadi pemakaiannya dicatat per
-- hari supaya angkanya bisa dilihat lalu diisi ke GEMINI_MODEL_BERAT_RPD.
--
-- Baris per user (bukan satu baris global): RLS tetap per akun, dan tidak ada
-- yang bisa membaca atau mengubah hitungan akun lain. Selama pemakainya hanya
-- satu orang, hitungan miliknya = hitungan global project (kuota Gemini per
-- project). Batas per orang masuk "Belum diterapkan" di spec.
--
-- Tanggal = tanggal Pasifik (America/Los_Angeles): kuota harian Gemini
-- direset tengah malam waktu Pasifik, bukan WIB.
--
-- Tidak ada INSERT/UPDATE langsung: hitungan hanya bertambah lewat
-- catat_pemakaian_ai(), yang selalu menulis baris milik auth.uid().
-- =============================================================

create table if not exists public.pemakaian_ai (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tanggal date not null,
  model   text not null check (length(model) between 1 and 100),
  jumlah  integer not null default 0 check (jumlah >= 0),
  primary key (user_id, tanggal, model)
);

alter table public.pemakaian_ai enable row level security;
revoke all on public.pemakaian_ai from anon, authenticated, service_role;
grant select on public.pemakaian_ai to authenticated;
grant select on public.pemakaian_ai to service_role;

drop policy if exists "pemakaian_ai_baca_sendiri" on public.pemakaian_ai;
create policy "pemakaian_ai_baca_sendiri"
  on public.pemakaian_ai for select
  using (auth.uid() = user_id);

-- Tambah hitungan hari ini (tanggal Pasifik) untuk model itu; mengembalikan
-- jumlah hari ini milik user ini sesudah ditambah.
create or replace function public.catat_pemakaian_ai(p_model text, p_jumlah integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hasil integer;
begin
  if auth.uid() is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;
  if p_model is null or length(p_model) not between 1 and 100 or p_jumlah is null or p_jumlah not between 1 and 50 then
    raise exception 'Isian tidak valid' using errcode = '22023';
  end if;
  insert into public.pemakaian_ai as p (user_id, tanggal, model, jumlah)
  values (auth.uid(), (now() at time zone 'America/Los_Angeles')::date, p_model, p_jumlah)
  on conflict (user_id, tanggal, model) do update set jumlah = p.jumlah + excluded.jumlah
  returning p.jumlah into hasil;
  return hasil;
end;
$$;
revoke execute on function public.catat_pemakaian_ai(text, integer) from public, anon;
grant execute on function public.catat_pemakaian_ai(text, integer) to authenticated;

-- Jumlah hari ini (tanggal Pasifik) milik user ini untuk model itu.
create or replace function public.pemakaian_ai_hari_ini(p_model text)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select jumlah from public.pemakaian_ai
     where user_id = auth.uid() and model = p_model and tanggal = (now() at time zone 'America/Los_Angeles')::date
  ), 0);
$$;
revoke execute on function public.pemakaian_ai_hari_ini(text) from public, anon;
grant execute on function public.pemakaian_ai_hari_ini(text) to authenticated;
