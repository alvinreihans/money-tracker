-- Pecah & gabung transaksi dalam satu transaksi database (SPEC-perbaikan-temuan
-- A3, SPEC-metode-budget). Dulu beberapa request terpisah dari browser: gagal
-- di tengah → jumlah bagian ≠ total semula dan saldo bergeser. Sekarang
-- semuanya berhasil atau tidak ada yang berubah.
--
-- security invoker: tulis lewat view public.transactions, jadi trigger tulis
-- (enkripsi, pemeriksaan rujukan) dan trigger salin/ikut pecahan tetap
-- berlaku, dan RLS membatasi ke baris milik user.

-- p_bagian: array JSON berurutan; elemen pertama = transaksi asli (id-nya
-- tetap p_id), sisanya bagian lama (dengan "id") atau baru (tanpa "id").
-- Tiap elemen: amount, category, kelompok (null = ikut kategori), description.
-- Satu elemen saja = digabung lagi. Mengembalikan jumlah bagian.
create or replace function public.simpan_pecahan(p_id uuid, p_bagian jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  asli public.transactions;
  total numeric;
  jumlah numeric;
  b jsonb;
  bid uuid;
  tetap uuid[] := '{}';
  ke integer := 0;
begin
  select * into asli from public.transactions
   where id = p_id and user_id = auth.uid() and pecahan_dari is null;
  if not found then
    raise exception 'Transaksi tidak ditemukan' using errcode = 'P0002';
  end if;
  if asli.type <> 'expense' then
    raise exception 'Hanya pengeluaran yang bisa dipecah' using errcode = '22023';
  end if;
  if jsonb_typeof(p_bagian) is distinct from 'array' or jsonb_array_length(p_bagian) = 0 then
    raise exception 'Bagian pecahan kosong' using errcode = '22023';
  end if;

  -- Total semula = asli + semua bagiannya sekarang; jumlah bagian baru harus sama.
  select asli.amount + coalesce(sum(t.amount), 0) into total
    from public.transactions t where t.pecahan_dari = p_id;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into jumlah from jsonb_array_elements(p_bagian) x;
  if exists (select 1 from jsonb_array_elements(p_bagian) x where coalesce((x ->> 'amount')::numeric, 0) <= 0) then
    raise exception 'Tiap bagian harus punya nominal' using errcode = '22023';
  end if;
  if jumlah <> total then
    raise exception 'Jumlah bagian harus sama dengan total semula' using errcode = '22023';
  end if;

  -- Bagian lama yang disebut harus memang bagian transaksi ini.
  for b in select x from jsonb_array_elements(p_bagian) with ordinality as e(x, n) where n > 1 and x ->> 'id' is not null loop
    bid := (b ->> 'id')::uuid;
    if not exists (select 1 from public.transactions where id = bid and pecahan_dari = p_id) then
      raise exception 'Bagian tidak ditemukan' using errcode = 'P0002';
    end if;
    tetap := tetap || bid;
  end loop;

  -- Bagian yang tidak disebut lagi dihapus.
  delete from public.transactions where pecahan_dari = p_id and not (id = any (tetap));

  for b in select x from jsonb_array_elements(p_bagian) x loop
    ke := ke + 1;
    if ke = 1 then
      -- Usulan pecah selesai dipakai, apa pun hasil pecahannya (SPEC-tawar-pecah).
      update public.transactions set
        amount = (b ->> 'amount')::numeric,
        category = b ->> 'category',
        kelompok = nullif(b ->> 'kelompok', ''),
        description = nullif(btrim(b ->> 'description'), ''),
        usulan_pecah = null
      where id = p_id;
    elsif b ->> 'id' is not null then
      update public.transactions set
        amount = (b ->> 'amount')::numeric,
        category = b ->> 'category',
        kelompok = nullif(b ->> 'kelompok', ''),
        description = nullif(btrim(b ->> 'description'), '')
      where id = (b ->> 'id')::uuid;
    else
      -- Tanggal, jam, kantong, merchant, jenis, status disalin trigger dari aslinya.
      insert into public.transactions (
        user_id, type, status, source, transaction_date, kantong_id, pecahan_dari,
        amount, category, kelompok, description
      ) values (
        asli.user_id, asli.type, asli.status, asli.source, asli.transaction_date, asli.kantong_id, p_id,
        (b ->> 'amount')::numeric, b ->> 'category', nullif(b ->> 'kelompok', ''), nullif(btrim(b ->> 'description'), '')
      );
    end if;
  end loop;

  return ke;
end;
$$;

-- Gabungkan lagi jadi satu: semua bagian dihapus, transaksi asli kembali ke
-- total dengan kategori & kelompok bagian pertama. Mengembalikan totalnya.
create or replace function public.gabung_pecahan(p_id uuid)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  asli public.transactions;
  total numeric;
begin
  select * into asli from public.transactions
   where id = p_id and user_id = auth.uid() and pecahan_dari is null;
  if not found then
    raise exception 'Transaksi tidak ditemukan' using errcode = 'P0002';
  end if;
  select asli.amount + coalesce(sum(t.amount), 0) into total
    from public.transactions t where t.pecahan_dari = p_id;
  delete from public.transactions where pecahan_dari = p_id;
  update public.transactions set amount = total where id = p_id;
  return total;
end;
$$;

revoke execute on function public.simpan_pecahan(uuid, jsonb) from public, anon;
revoke execute on function public.gabung_pecahan(uuid) from public, anon;
grant execute on function public.simpan_pecahan(uuid, jsonb) to authenticated;
grant execute on function public.gabung_pecahan(uuid) to authenticated;
