-- Perbaikan 20261105000000_metode_budget.sql: trigger kelompok kategori
-- dijalankan sebagai pemiliknya (security definer). Tanpa ini, user biasa
-- ditolak "permission denied for schema private" setiap menambah atau mengubah
-- kategori, karena fungsi bawaannya ada di skema private yang tidak bisa
-- diakses role authenticated. Isinya sama; hanya cara menjalankannya.
create or replace function private.kategori_kelompok()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'expense' then
    new.kelompok := coalesce(new.kelompok, private.kelompok_bawaan(new.slug));
  else
    new.kelompok := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.kategori_kelompok() from public, anon, authenticated;
