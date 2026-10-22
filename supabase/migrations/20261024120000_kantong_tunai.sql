-- =============================================================
-- Migration: kantong Tunai bawaan yang tidak bisa dihapus + emoji kantong
-- =============================================================
-- Tiap user selalu punya satu kantong tunai bawaan (uang di dompet), jadi
-- transaksi tunai selalu punya tempat. Boleh diganti nama & saldo awalnya,
-- tapi tidak bisa dihapus dan jenisnya tetap tunai.
alter table public.user_accounts
  add column if not exists bawaan boolean not null default false,
  -- Penanda kantong pilihan user, pengganti pilihan jenis bank/e-wallet.
  add column if not exists emoji text check (emoji is null or char_length(emoji) <= 16);

update public.user_accounts
set emoji = case kind when 'cash' then '💵' when 'ewallet' then '📱' else '🏦' end
where emoji is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_accounts_bawaan_tunai') then
    alter table public.user_accounts
      add constraint user_accounts_bawaan_tunai check (not bawaan or kind = 'cash');
  end if;
end$$;

-- Satu kantong bawaan per user.
create unique index if not exists idx_user_accounts_bawaan
  on public.user_accounts (user_id)
  where bawaan;

-- Kolom bawaan hanya diatur di sini, tidak dari aplikasi: kalau bisa diubah
-- jadi false, kantongnya bisa dihapus juga.
revoke insert, update on public.user_accounts from authenticated;
grant insert (user_id, name, emoji, aliases, saldo_awal, saldo_per) on public.user_accounts to authenticated;
grant update (name, emoji, aliases, saldo_awal, saldo_per) on public.user_accounts to authenticated;

drop policy if exists "user_accounts_own" on public.user_accounts;
drop policy if exists "user_accounts_select" on public.user_accounts;
drop policy if exists "user_accounts_insert" on public.user_accounts;
drop policy if exists "user_accounts_update" on public.user_accounts;
drop policy if exists "user_accounts_delete" on public.user_accounts;
create policy "user_accounts_select" on public.user_accounts for select using (auth.uid() = user_id);
create policy "user_accounts_insert" on public.user_accounts for insert with check (auth.uid() = user_id);
create policy "user_accounts_update" on public.user_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "user_accounts_delete" on public.user_accounts for delete
  using (auth.uid() = user_id and not bawaan);

-- Pasang kantong tunai bawaan untuk satu user: kantong tunai tertua yang
-- sudah ada dijadikan bawaan; kalau belum punya, dibuatkan "Tunai".
create or replace function public.seed_kantong_tunai(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.user_accounts where user_id = uid and bawaan) then
    return;
  end if;

  update public.user_accounts set bawaan = true
  where id = (
    select id from public.user_accounts
    where user_id = uid and kind = 'cash'
    order by created_at
    limit 1
  );
  if found then
    return;
  end if;

  -- Nama "Tunai" bisa sudah dipakai kantong lain (unique per user).
  insert into public.user_accounts (user_id, name, kind, bawaan, emoji)
  values (uid, 'Tunai', 'cash', true, '💵')
  on conflict (user_id, name) do nothing;
  if not found then
    insert into public.user_accounts (user_id, name, kind, bawaan, emoji)
    values (uid, 'Uang tunai', 'cash', true, '💵')
    on conflict (user_id, name) do nothing;
  end if;
end;
$$;

revoke execute on function public.seed_kantong_tunai(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user_kantong()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_kantong_tunai(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_kantong on auth.users;
create trigger on_auth_user_created_kantong
  after insert on auth.users
  for each row execute function public.handle_new_user_kantong();

-- User lama.
select public.seed_kantong_tunai(id) from auth.users;
