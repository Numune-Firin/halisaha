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
-- DIKKAT: RLS sutun bazinda kisitlayamaz; bu politika tek basina oyuncunun kendi
-- satirindaki role/status sutunlarini da yazmasina izin verirdi. Rol ve durum
-- sutunlarini asagidaki profiles_guard_privileges_trg tetikleyicisi korur.
create policy profiles_update_own on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_update_admin on profiles for update
  using (is_admin()) with check (is_admin());

-- Yetki yukseltmesi korumasi: bir uye kendi satirinda id, role ve status
-- sutunlarini degistiremez. Aksi halde onay bekleyen bir hesap, anon anahtar ve
-- kendi oturumuyla tek bir istekte status='active', role='admin' yazip
-- uygulamadaki tum yetki kapilarini atlayabilirdi.
create or replace function public.guard_profile_privilege_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Iki muafiyet:
  --   1) Oturum yok (auth.uid() null): SQL Editor'den calisan kurulum komutlari
  --      ve service_role baglantilari. KURULUM.md 9. adimindaki "ilk admin"
  --      guncellemesi bu muafiyet sayesinde calisir.
  --   2) Admin: approveMember gibi yonetici islemleri baska bir uyenin durumunu
  --      ve rolunu degistirebilmeye devam eder.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.status is distinct from old.status then
    raise exception 'Rol ve durum degisikligini yalnizca yonetici yapabilir';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileges_trg
  before update on profiles
  for each row execute function public.guard_profile_privilege_fields();

-- seasons / matches / settings: aktif uyeler okur, admin yazar
create policy seasons_select on seasons for select using (is_active_member());
create policy seasons_all    on seasons for all    using (is_admin()) with check (is_admin());

create policy matches_select on matches for select using (is_active_member());
create policy matches_all    on matches for all    using (is_admin()) with check (is_admin());

create policy settings_select on settings for select using (is_active_member());
create policy settings_all    on settings for all    using (is_admin()) with check (is_admin());

-- match_entries: aktif uyeler okur, yalnizca admin dogrudan yazar.
-- Oyuncunun ankete girmesi/cikmasi yalnizca join_poll ve leave_poll RPC'lerinden
-- gecer; bu fonksiyonlar security definer'dir ve yalnizca service_role'a aciktir
-- (service_role RLS'e tabi degildir). Bu yuzden oyuncuya dogrudan insert/update
-- izni VERILMEZ: verilseydi oyuncu RPC'yi atlayarak bekleyen cezasini
-- tuketmeden ankete girebilir, gec cikis cezasindan kacabilir ya da
-- withdrawn_at'i null'a cekip eski entered_at ile siraya geri donebilirdi.
create policy match_entries_select on match_entries for select
  using (is_active_member());

create policy match_entries_all_admin on match_entries for all
  using (is_admin()) with check (is_admin());

-- adjustments: aktif uyeler okur (seffaflik), yalnizca admin yazar
create policy adjustments_select on adjustments for select using (is_active_member());
create policy adjustments_all    on adjustments for all    using (is_admin()) with check (is_admin());
