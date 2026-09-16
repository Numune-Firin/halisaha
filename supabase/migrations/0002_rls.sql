-- Yetki yardimcilari. security definer: RLS dongusune girmeden profiles'i okur.
create or replace function public.is_aktif_uye() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and durum = 'aktif'
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and durum = 'aktif' and rol = 'admin'
  );
$$;

-- Yeni auth kullanicisi icin otomatik profil. Varsayilan durum: onay_bekliyor
create or replace function public.yeni_kullanici_profili()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, ad, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger yeni_kullanici_profili_trg
  after insert on auth.users
  for each row execute function public.yeni_kullanici_profili();

-- RLS'i her tabloda ac
alter table profiles      enable row level security;
alter table seasons       enable row level security;
alter table matches       enable row level security;
alter table match_entries enable row level security;
alter table adjustments   enable row level security;
alter table settings      enable row level security;

-- profiles: aktif uyeler herkesi gorur; herkes kendi satirini gorur (onay bekleyen dahil)
create policy profiles_select on profiles for select
  using (is_aktif_uye() or id = auth.uid());

-- Oyuncu yalniz kendi ad/mevki/avatar alanini degistirebilir.
-- Rol ve durum degisikligi ayri politikayla yalnizca admin'e acik.
create policy profiles_update_kendi on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_update_admin on profiles for update
  using (is_admin()) with check (is_admin());

-- seasons / matches / settings: aktif uyeler okur, admin yazar
create policy seasons_select on seasons for select using (is_aktif_uye());
create policy seasons_all    on seasons for all    using (is_admin()) with check (is_admin());

create policy matches_select on matches for select using (is_aktif_uye());
create policy matches_all    on matches for all    using (is_admin()) with check (is_admin());

create policy settings_select on settings for select using (is_aktif_uye());
create policy settings_all    on settings for all    using (is_admin()) with check (is_admin());

-- match_entries: aktif uyeler okur.
-- Oyuncu yalnizca kendi adina ve yalnizca 'normal' tipte giris yapabilir.
-- 'vip' ve 'oncelikli' tipleri, vip_sira ve ofset_sn yalnizca admin tarafindan yazilir.
create policy match_entries_select on match_entries for select
  using (is_aktif_uye());

create policy match_entries_insert_kendi on match_entries for insert
  with check (
    oyuncu_id = auth.uid()
    and is_aktif_uye()
    and tip = 'normal'
    and vip_sira is null
    and ofset_sn = 0
    and exists (
      select 1 from matches m
      where m.id = mac_id and m.durum = 'anket_acik'
    )
  );

create policy match_entries_update_kendi on match_entries for update
  using (oyuncu_id = auth.uid() and is_aktif_uye())
  with check (oyuncu_id = auth.uid());

create policy match_entries_all_admin on match_entries for all
  using (is_admin()) with check (is_admin());

-- adjustments: aktif uyeler okur (seffaflik), yalnizca admin yazar
create policy adjustments_select on adjustments for select using (is_aktif_uye());
create policy adjustments_all    on adjustments for all    using (is_admin()) with check (is_admin());
