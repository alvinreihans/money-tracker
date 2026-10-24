-- Transaksi ikutan (cashback, biaya admin) selalu tepat di bawah induknya di
-- Riwayat/Beranda. Daftar diurutkan per tanggal, jam, lalu waktu catat; ikutan
-- dicatat sesudah induknya, jadi dulu bisa terpisah jauh. Sekarang ikutan
-- memakai tanggal, jam, dan waktu catat yang sama dengan induknya (urutan
-- terakhir: induk dulu, lihat queryRiwayat).

-- 1. Ikutan baru: salin dari induknya.
create or replace function private.ikutan_salin_induk()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  induk private.transaksi_data;
begin
  select * into induk from private.transaksi_data where id = new.induk_id;
  if found then
    new.transaction_date := induk.transaction_date;
    new.waktu := induk.waktu;
    new.created_at := induk.created_at;
  end if;
  return new;
end;
$$;
revoke execute on function private.ikutan_salin_induk() from public, anon, authenticated;

drop trigger if exists ikutan_salin_induk on private.transaksi_data;
create trigger ikutan_salin_induk
  before insert on private.transaksi_data
  for each row when (new.induk_id is not null)
  execute function private.ikutan_salin_induk();

-- 2. Tanggal/jam induk diubah (edit, koreksi, jawab "jam berapa"): ikutan ikut.
create or replace function private.ikutan_ikut_induk()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update private.transaksi_data
     set transaction_date = new.transaction_date, waktu = new.waktu
   where induk_id = new.id
     and (transaction_date is distinct from new.transaction_date or waktu is distinct from new.waktu);
  return null;
end;
$$;
revoke execute on function private.ikutan_ikut_induk() from public, anon, authenticated;

drop trigger if exists ikutan_ikut_induk on private.transaksi_data;
create trigger ikutan_ikut_induk
  after update of transaction_date, waktu on private.transaksi_data
  for each row when (new.induk_id is null)
  execute function private.ikutan_ikut_induk();

-- 3. Data lama.
update private.transaksi_data c
   set transaction_date = p.transaction_date, waktu = p.waktu, created_at = p.created_at
  from private.transaksi_data p
 where c.induk_id = p.id
   and (c.transaction_date is distinct from p.transaction_date
        or c.waktu is distinct from p.waktu
        or c.created_at is distinct from p.created_at);
