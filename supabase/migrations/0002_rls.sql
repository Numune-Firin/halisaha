-- Yetki yardimcilari. security definer: RLS dongusune girmeden profiles'i okur.
create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;

-- Yeni auth kullanicisi icin otomatik profil. Varsayilan durum: onay bekliyor
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS'i her tabloda ac
alter table profiles      enable row level security;
alter table seasons       enable row level security;
alter table matches       enable row level security;
alter table match_entries enable row level security;
alter table adjustments   enable row level security;
alter table settings      enable row level security;

-- profiles: aktif uyeler herkesi gorur; herkes kendi satirini gorur (onay bekleyen dahil)
create policy profiles_select on profiles for select
  using (is_active_member() or id = auth.uid());

-- Oyuncu yalniz kendi adini, mevkisini ve avatarini degistirebilir.
-- Rol ve durum degisikligi ayri politikayla yalnizca admin'e acik.
create policy profiles_update_own on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_update_admin on profiles for update
  using (is_admin()) with check (is_admin());

-- seasons / matches / settings: aktif uyeler okur, admin yazar
create policy seasons_select on seasons for select using (is_active_member());
create policy seasons_all    on seasons for all    using (is_admin()) with check (is_admin());

create policy matches_select on matches for select using (is_active_member());
create policy matches_all    on matches for all    using (is_admin()) with check (is_admin());

create policy settings_select on settings for select using (is_active_member());
create policy settings_all    on settings for all    using (is_admin()) with check (is_admin());

-- match_entries: aktif uyeler okur.
-- Oyuncu yalnizca kendi adina ve yalnizca 'standard' tipte giris yapabilir.
-- 'vip' ve 'priority' tipleri, vip_rank ve offset_seconds yalnizca admin tarafindan yazilir.
create policy match_entries_select on match_entries for select
  using (is_active_member());

create policy match_entries_insert_own on match_entries for insert
  with check (
    player_id = auth.uid()
    and is_active_member()
    and entry_type = 'standard'
    and vip_rank is null
    and offset_seconds = 0
    and exists (
      select 1 from matches m
      where m.id = match_id and m.status = 'poll_open'
    )
  );

create policy match_entries_update_own on match_entries for update
  using (player_id = auth.uid() and is_active_member())
  with check (player_id = auth.uid());

create policy match_entries_all_admin on match_entries for all
  using (is_admin()) with check (is_admin());

-- adjustments: aktif uyeler okur (seffaflik), yalnizca admin yazar
create policy adjustments_select on adjustments for select using (is_active_member());
create policy adjustments_all    on adjustments for all    using (is_admin()) with check (is_admin());
