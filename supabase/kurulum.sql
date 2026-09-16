-- =============================================================================
-- HALI SAHA - TEK PARCA VERITABANI KURULUM DOSYASI
-- =============================================================================
--
-- Bu dosya, supabase/migrations/ klasorundeki alti migration dosyasinin
-- (0001'den 0006'ya) sirayla ve degistirilmeden birlestirilmis halidir.
-- Amac: Supabase panelindeki "SQL Editor"e tek seferde kopyala-yapistir-calistir
-- yapabilmen; alti ayri dosyayla tek tek ugrasman gerekmesin.
--
-- ONEMLI - LUTFEN OKU:
--   1) Bu dosyayi SADECE BIR KEZ calistir. Yeni acilan (bos) bir Supabase
--      projesinde calistirmak icindir.
--   2) Eger bu dosyayi ikinci kez calistirirsan "already exists" (zaten var)
--      turunde hatalar alirsin, cunku tablolar/fonksiyonlar/politikalar zaten
--      olusturulmus olur. Bu normaldir, veritabanina zarar vermez; sadece
--      dosyayi tekrar calistirmana gerek olmadiginin isaretidir.
--   3) Adim adim kurulum talimati icin proje kokundeki KURULUM.md dosyasina bak.
--   4) supabase/migrations/ klasorundeki alti dosya SILINMEDI, bu dosyayla
--      birlikte duruyor (ileride yeni migration eklemek icin referans olarak).
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0001_sema.sql
-- Semayi olusturur: tipler, tablolar (profiles, seasons, matches, match_entries, adjustments, settings) ve tetikleyiciler.
-- -----------------------------------------------------------------------------

-- Enum tipleri
create type position_t      as enum ('goalkeeper','defender','midfielder','forward');
create type role_t          as enum ('admin','player');
create type member_status_t as enum ('pending','active','inactive');
create type match_status_t  as enum ('poll_open','squad_locked','played','completed');
create type entry_type_t    as enum ('vip','priority','standard');

-- Uyeler
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  text not null default '',
  position   position_t,
  role       role_t not null default 'player',
  status     member_status_t not null default 'pending',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Sezonlar
create table seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  starts_on  date not null,
  ends_on    date,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
-- Ayni anda yalnizca bir aktif sezon olabilir
create unique index seasons_single_active on seasons (is_active) where is_active;

-- Maclar
create table matches (
  id                              uuid primary key default gen_random_uuid(),
  season_id                       uuid references seasons(id) on delete set null,
  kickoff_at                      timestamptz not null,
  venue                           text not null default '',
  status                          match_status_t not null default 'poll_open',
  squad_size                      int not null default 14 check (squad_size between 2 and 40),
  fee_per_player                  numeric(10,2) not null default 0 check (fee_per_player >= 0),
  withdrawal_window_hours         int not null default 20 check (withdrawal_window_hours >= 0),
  late_withdrawal_penalty_seconds int not null default 8 check (late_withdrawal_penalty_seconds >= 0),
  poll_opened_at                  timestamptz not null default now(),
  payment_due_on                  date,
  black_score                     int check (black_score >= 0),
  white_score                     int check (white_score >= 0),
  created_at                      timestamptz not null default now()
);

-- Ankete giris kayitlari (VIP dahil)
create table match_entries (
  id                   uuid primary key default gen_random_uuid(),
  match_id             uuid not null references matches(id) on delete cascade,
  player_id            uuid not null references profiles(id) on delete cascade,
  entry_type           entry_type_t not null default 'standard',
  entered_at           timestamptz not null default now(),
  offset_seconds       int not null default 0,
  vip_rank             int,
  withdrawn_at         timestamptz,
  is_late_withdrawal   boolean not null default false,
  unique (match_id, player_id)
);
create index match_entries_match_idx on match_entries (match_id);

-- Giris zamani her zaman sunucu saatiyle yazilir; istemciden gelen deger yok sayilir
create or replace function force_entry_timestamp()
returns trigger language plpgsql as $$
begin
  new.entered_at := now();
  return new;
end;
$$;

create trigger match_entries_entered_at_trg
  before insert on match_entries
  for each row execute function force_entry_timestamp();

-- Ceza / odul kayitlari. saniye > 0 ceza, < 0 odul
create table adjustments (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references profiles(id) on delete cascade,
  seconds           int not null check (seconds <> 0),
  reason            text not null default '',
  source_match_id   uuid references matches(id) on delete set null,
  applied_match_id  uuid references matches(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index adjustments_pending_idx
  on adjustments (player_id) where applied_match_id is null;

-- Varsayilan ayarlar (tek satir)
create table settings (
  id                              boolean primary key default true check (id),
  squad_size                      int not null default 14,
  fee_per_player                  numeric(10,2) not null default 0,
  withdrawal_window_hours         int not null default 20,
  late_withdrawal_penalty_seconds int not null default 8
);
insert into settings default values;


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0002_rls.sql
-- Satir Seviyesi Guvenlik (RLS) politikalarini acar: kim hangi satiri okuyabilir/yazabilir kurallarini tanimlar.
-- -----------------------------------------------------------------------------

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

create trigger yeni_kullanici_profili_trg
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


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0003_ofset_koruma.sql
-- Kullanicilarin kendi ceza/odul (ofset) degerlerini degistirmesini engelleyen ek koruma kurali.
-- -----------------------------------------------------------------------------

-- Oyuncu kendi anket satirini guncellerken yalnizca cikis zamani alanini degistirebilir.
-- Admin (service_role veya rolu 'admin' olan uye) bu kisitin disindadir.
create or replace function guard_player_entry_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sistem RPC'leri (join_poll, leave_poll) islem basinda app.system_operation
  -- bayragini set eder ve bu kisittan muaf tutulur. Bayrak islem sonunda duser.
  if public.is_admin()
     or coalesce(current_setting('app.system_operation', true), '0') = '1' then
    return new;
  end if;

  if new.entry_type <> old.entry_type
     or new.offset_seconds <> old.offset_seconds
     or new.vip_rank is distinct from old.vip_rank
     or new.entered_at <> old.entered_at
     or new.player_id <> old.player_id
     or new.match_id <> old.match_id then
    raise exception 'Bu alanlari yalnizca yonetici degistirebilir';
  end if;

  return new;
end;
$$;

create trigger match_entries_guard_trg
  before update on match_entries
  for each row execute function guard_player_entry_fields();


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0004_rpc.sql
-- Ankete giris/cikis islemlerini tek ve guvenli bir islemde yapan RPC (sunucu) fonksiyonlarini tanimlar.
-- -----------------------------------------------------------------------------

-- Eski imzalar (brief'in ilk halinde join_poll(uuid, int) idi) once dusuruluyor.
-- create or replace yalnizca ayni imzali fonksiyonun govdesini degistirir; farkli
-- imzali eski bir surum varsa PUBLIC calistirma yetkisiyle yerinde kalir ve
-- asagidaki revoke/grant satirlari onu hedeflemez. Once temizle, sonra yarat.
drop function if exists public.join_poll(uuid, int);
drop function if exists public.leave_poll(uuid, uuid, boolean, int);

-- Ankete giris. Ilk giris ve cikip tekrar girme ayni yoldan gecer.
-- Tekrar giriste giris zamani sifirlanir (yeni sira), tip korunur:
-- oncelikli oyuncu tekrar girdiginde yine oncelikli katmaninda kalir.
-- Ofset yazimi ile ceza kayitlarinin tuketilmesi tek islemde gerceklesir.
-- Yalnizca service_role cagirabilir; kimlik dogrulamasi uygulama katmanindadir.
create or replace function public.join_poll(
  p_match_id uuid, p_player_id uuid, p_offset int, p_consumed_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from matches where id = p_match_id and status = 'poll_open'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.system_operation', '1', true);

  insert into match_entries (match_id, player_id, entry_type, offset_seconds)
  values (p_match_id, p_player_id, 'standard', p_offset)
  on conflict (match_id, player_id) do update
     set withdrawn_at       = null,
         is_late_withdrawal = false,
         entered_at         = now(),
         offset_seconds     = match_entries.offset_seconds + p_offset;

  if array_length(p_consumed_ids, 1) is not null then
    update adjustments
       set applied_match_id = p_match_id
     where id = any(p_consumed_ids)
       and player_id = p_player_id
       and applied_match_id is null;
  end if;

  -- Bayrak islem kapsamli (set_config'in ucuncu parametresi true = local).
  -- Yine de acikca sifirlanir: bu fonksiyon ileride baska bir plpgsql
  -- fonksiyonundan cagrilirsa, cagiranin geri kalani ayni islemde 0003'teki
  -- alan korumasindan sessizce muaf kalmasin.
  perform set_config('app.system_operation', '0', true);
end;
$$;

-- Cikis ve gec cikis cezasini tek islemde yazar.
-- Yalnizca service_role cagirabilir.
create or replace function public.leave_poll(
  p_match_id uuid, p_player_id uuid, p_is_late boolean, p_penalty_seconds int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not exists (
    select 1 from matches where id = p_match_id and status = 'poll_open'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.system_operation', '1', true);

  update match_entries
     set withdrawn_at = now(), is_late_withdrawal = p_is_late
   where match_id = p_match_id and player_id = p_player_id and withdrawn_at is null;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ankette acik kayit yok';
  end if;

  if p_is_late and p_penalty_seconds > 0 then
    insert into adjustments (player_id, seconds, reason, source_match_id)
    values (p_player_id, p_penalty_seconds, 'Geç çıkış', p_match_id);
  end if;

  perform set_config('app.system_operation', '0', true);
end;
$$;

revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from public;
revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from authenticated;
revoke all on function public.leave_poll(uuid, uuid, boolean, int) from public;
revoke all on function public.leave_poll(uuid, uuid, boolean, int) from authenticated;
grant execute on function public.join_poll(uuid, uuid, int, uuid[]) to service_role;
grant execute on function public.leave_poll(uuid, uuid, boolean, int) to service_role;


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0005_match_squad.sql
-- Kesinlesen kadroyu (siyah/beyaz takim atamasi) saklayan match_squad tablosunu ve RLS politikalarini olusturur.
-- -----------------------------------------------------------------------------

create type team_t as enum ('black','white');

create table match_squad (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references matches(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  team      team_t,
  unique (match_id, player_id)
);
create index match_squad_match_idx on match_squad (match_id);

alter table match_squad enable row level security;
create policy match_squad_select on match_squad for select using (is_active_member());
create policy match_squad_all    on match_squad for all    using (is_admin()) with check (is_admin());


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0006_kadro_kesinlestir.sql
-- Admin'in kadroyu kesinlestirmesini saglayan fonksiyonu tanimlar.
-- -----------------------------------------------------------------------------

-- Kesin kadroyu tek islemde yazar: eski kadroyu siler, yenisini ekler,
-- maci kadrosu kesinlesmis duruma gecirir. Ucu birden basarili olur ya da hicbiri olmaz.
-- Yetki kontrolu fonksiyonun icinde; authenticated role acik olmasi guvenli.
create or replace function public.lock_squad(
  p_match_id uuid, p_player_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if not exists (select 1 from matches where id = p_match_id) then
    raise exception 'Mac bulunamadi';
  end if;

  delete from match_squad where match_id = p_match_id;

  if array_length(p_player_ids, 1) is not null then
    insert into match_squad (match_id, player_id)
    select p_match_id, unnest(p_player_ids);
  end if;

  update matches set status = 'squad_locked' where id = p_match_id;
end;
$$;

revoke all on function public.lock_squad(uuid, uuid[]) from public;
grant execute on function public.lock_squad(uuid, uuid[]) to authenticated;


