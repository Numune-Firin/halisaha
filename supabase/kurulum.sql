-- =============================================================================
-- HALI SAHA - TEK PARCA VERITABANI KURULUM DOSYASI
-- =============================================================================
--
-- Bu dosya, supabase/migrations/ klasorundeki yirmi uc migration dosyasinin
-- (0001'den 0023'e) sirayla ve degistirilmeden birlestirilmis halidir.
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
--   4) supabase/migrations/ klasorundeki dosyalar SILINMEDI, bu dosyayla
--      birlikte duruyor (ileride yeni migration eklemek icin referans olarak).
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0001_schema.sql
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
-- Satir bazli guvenlik: yetki yardimcilari, yeni kullanici tetikleyicisi ve butun tablolarin politikalari.
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

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0003_offset_guard.sql
-- Oyuncunun kendi anket satirinda giris saatini ve ofseti degistirmesini engelleyen tetikleyici.
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
-- Ankete giris/cikis islemleri: join_poll ve leave_poll fonksiyonlari.
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
declare
  v_offset int;
begin
  if not exists (
    select 1 from matches where id = p_match_id and status = 'poll_open'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.system_operation', '1', true);

  -- Ilk giriste p_offset yazilir; tekrar giriste satirdaki ofsete DOKUNULMAZ.
  -- Iki dalda da dogru deger asagida, tuketim isaretlendikten sonra yeniden
  -- hesaplanarak yazilir.
  insert into match_entries (match_id, player_id, entry_type, offset_seconds)
  values (p_match_id, p_player_id, 'standard', p_offset)
  on conflict (match_id, player_id) do update
     set withdrawn_at       = null,
         is_late_withdrawal = false,
         entered_at         = now();

  if array_length(p_consumed_ids, 1) is not null then
    update adjustments
       set applied_match_id = p_match_id
     where id = any(p_consumed_ids)
       and player_id = p_player_id
       and applied_match_id is null;
  end if;

  -- Ofseti bu maca uygulanmis TUM ceza/odullerden yeniden hesapla.
  -- "+ p_offset" ile toplamak, butona hizli iki kez tiklandiginda (iki istek de
  -- ayni bekleyen cezayi okur) cezayi iki kez uygulayip bir kez tuketiyordu.
  -- Yeniden hesaplama her iki sorunu da cozer: ikinci cagri yeni bir kayit
  -- tuketmedigi icin ayni toplami uretir (idempotent), tekrar giriste ise ilk
  -- giriste uygulanmis cezalar toplamda kalmaya devam eder (ceza silinmez).
  select coalesce(sum(seconds), 0) into v_offset
    from adjustments
   where player_id = p_player_id and applied_match_id = p_match_id;

  update match_entries
     set offset_seconds = v_offset
   where match_id = p_match_id and player_id = p_player_id;

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
-- Kesin kadro tablosu (match_squad) ve takim tipi.
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
-- KAYNAK: supabase/migrations/0006_lock_squad.sql
-- Kadroyu tek islemde yazan ve maci kilitleyen lock_squad fonksiyonu.
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

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0007_realtime.sql
-- Anket listesinin canli guncellenmesi icin realtime yayini.
-- -----------------------------------------------------------------------------

-- Anket listesinin canli guncellenmesi icin match_entries tablosunu
-- Supabase Realtime yayinina ekler. Yayinda zaten varsa hata vermez.
do $$
begin
  alter publication supabase_realtime add table public.match_entries;
exception
  when duplicate_object then null;
end;
$$;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0008_match_schedules.sql
-- Haftalik anket takvimi: match_schedules tablosu ve vakti gelen maclari acan ensure_scheduled_matches.
-- -----------------------------------------------------------------------------

-- Haftalik tekrar eden anket takvimi.
--
-- Amac: "her Pazartesi 12:00" gibi tek bir tanim yapildiginda maclarin ve
-- anketlerin kendiliginden acilmasi. Takvim bilerek SEZONA BAGLI DEGILDIR:
-- sezon bittiginde ya da yeni sezon acildiginda tanim yerinde kalir ve
-- uretilen maclar o an aktif olan sezona baglanir. Boylece yeni sezonun ilk
-- macinda yeniden tanim yapmak gerekmez.
create table match_schedules (
  id                              uuid primary key default gen_random_uuid(),
  -- ISO haftagunu: 1 = Pazartesi ... 7 = Pazar
  weekday                         int not null check (weekday between 1 and 7),
  start_time                      time not null,
  venue                           text not null default '',
  squad_size                      int not null default 14 check (squad_size between 2 and 40),
  fee_per_player                  numeric(10,2) not null default 0 check (fee_per_player >= 0),
  withdrawal_window_hours         int not null default 20 check (withdrawal_window_hours >= 0),
  late_withdrawal_penalty_seconds int not null default 8 check (late_withdrawal_penalty_seconds >= 0),
  -- Anket, mac saatine bu kadar gun kala acilir
  open_days_before                int not null default 7 check (open_days_before between 0 and 60),
  is_active                       boolean not null default true,
  created_at                      timestamptz not null default now()
);

-- Hangi macin hangi takvimden dogdugu izlenebilsin
alter table matches add column schedule_id uuid references match_schedules(id) on delete set null;

-- Es zamanli iki uretim ayni maci iki kez yazamaz
create unique index matches_schedule_kickoff_uniq
  on matches (schedule_id, kickoff_at)
  where schedule_id is not null;

alter table match_schedules enable row level security;

-- seasons/matches ile ayni kural: aktif uyeler okur, admin yazar
create policy match_schedules_select on match_schedules for select using (is_active_member());
create policy match_schedules_all    on match_schedules for all    using (is_admin()) with check (is_admin());

-- Vakti gelmis takvim maclarini olusturur ve olusturulan sayiyi dondurur.
--
-- Idempotenttir: ayni an icin mac zaten varsa hicbir sey yapmaz, bu yuzden
-- her sayfa acilisinda cagrilabilir. Boylece ayri bir zamanlanmis gorev
-- (cron) kurmadan, uygulamayi kullanan ilk kisi yeni haftanin anketini acmis
-- olur. Istenirse pg_cron ile gunde bir kez de cagrilabilir.
--
-- security definer: anketi acma yetkisi adminde oldugu icin siradan bir uyenin
-- sayfa acmasi normalde mac yazamaz. Fonksiyon kullanici girdisi almaz, yalnizca
-- match_schedules satirlarini uygular; disaridan gelen tek sey cagirma anidir.
create or replace function public.ensure_scheduled_matches()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_schedule record;
  v_today    date;
  v_delta    int;
  v_date     date;
  v_kickoff  timestamptz;
  v_season   uuid;
  v_week     int;
  v_created  int := 0;
begin
  -- Anonim ya da onay bekleyen kullanicilar takvimi tetikleyemez
  if not is_active_member() then
    return 0;
  end if;

  select id into v_season from seasons where is_active limit 1;

  -- Gun donumu Turkiye saatine gore hesaplanir; sunucu UTC calisir
  v_today := (now() at time zone 'Europe/Istanbul')::date;

  for v_schedule in select * from match_schedules where is_active loop
    -- Bu haftanin ilgili gunune kac gun var (bugunse 0)
    v_delta := (v_schedule.weekday - extract(isodow from v_today)::int + 7) % 7;

    -- open_days_before en fazla 60 gun oldugu icin 10 hafta her durumu kapsar
    for v_week in 0..9 loop
      v_date    := v_today + v_delta + v_week * 7;
      v_kickoff := (v_date + v_schedule.start_time) at time zone 'Europe/Istanbul';

      -- Bu hafta cok uzaksa sonrakiler daha da uzaktir
      exit when v_kickoff > now() + make_interval(days => v_schedule.open_days_before);

      if v_kickoff > now()
         and not exists (select 1 from matches where kickoff_at = v_kickoff)
      then
        begin
          insert into matches (
            season_id, schedule_id, kickoff_at, venue, squad_size, fee_per_player,
            withdrawal_window_hours, late_withdrawal_penalty_seconds
          ) values (
            v_season, v_schedule.id, v_kickoff, v_schedule.venue, v_schedule.squad_size,
            v_schedule.fee_per_player, v_schedule.withdrawal_window_hours,
            v_schedule.late_withdrawal_penalty_seconds
          );
          v_created := v_created + 1;
        exception
          -- Baska bir istek ayni maci bizden once yazdi; sorun degil
          when unique_violation then null;
        end;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.ensure_scheduled_matches() from public;
grant execute on function public.ensure_scheduled_matches() to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0009_guests_and_squad_control.sql
-- Aday oyuncular, ankete elle kisi ekleme/cikarma ve kadro kilidinin geri alinmasi.
-- -----------------------------------------------------------------------------

-- Aday oyuncular, kadro kilidinin geri alinmasi ve ankete elle kisi ekleme.
--
-- 1) Aday oyuncu: gruba uye olmayan, Google hesabiyla girmeyen ama maca gelen
--    kisi. auth.users kaydi olmadigi icin profiles'a yazilamaz, ayri tabloda
--    tutulur. Ankette ve kadroda uyelerle ayni satirlarda yer alir.
-- 2) Kadro ancak kontenjan dolunca kesinlestirilebilir.
-- 3) Kesinlesmis kadro admin tarafindan geri alinabilir.
create table guest_players (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null check (length(btrim(full_name)) > 0),
  position   position_t,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table guest_players enable row level security;
create policy guest_players_select on guest_players for select using (is_active_member());
create policy guest_players_all    on guest_players for all    using (is_admin()) with check (is_admin());

-- Anket ve kadro satirlari artik ya bir uyeye ya da bir aday oyuncuya aittir.
-- num_nonnulls = 1 ikisinin ayni anda dolu ya da ikisinin birden bos olmasini engeller.
alter table match_entries
  alter column player_id drop not null,
  add column guest_id uuid references guest_players(id) on delete cascade,
  add constraint match_entries_participant_ck check (num_nonnulls(player_id, guest_id) = 1);

-- (match_id, player_id) tekilligi, player_id null olabildigi icin kismi indekse cevrilir
alter table match_entries drop constraint match_entries_match_id_player_id_key;
create unique index match_entries_player_uniq on match_entries (match_id, player_id) where player_id is not null;
create unique index match_entries_guest_uniq  on match_entries (match_id, guest_id)  where guest_id  is not null;

alter table match_squad
  alter column player_id drop not null,
  add column guest_id uuid references guest_players(id) on delete cascade,
  add constraint match_squad_participant_ck check (num_nonnulls(player_id, guest_id) = 1);

alter table match_squad drop constraint match_squad_match_id_player_id_key;
create unique index match_squad_player_uniq on match_squad (match_id, player_id) where player_id is not null;
create unique index match_squad_guest_uniq  on match_squad (match_id, guest_id)  where guest_id  is not null;

-- Kesin kadroyu tek islemde yazar: eski kadroyu siler, yenisini ekler, maci
-- kadrosu kesinlesmis duruma gecirir. Ucu birden basarili olur ya da hicbiri olmaz.
--
-- 0006'daki surumun uzerine iki degisiklik: aday oyuncular da kadroya yazilabilir
-- ve secilen kisi sayisi kontenjana esit degilse kilitleme reddedilir. Sayi
-- kontrolu burada, veritabaninda yapilir; arayuzdeki kontrol yalnizca kolaylik.
drop function if exists public.lock_squad(uuid, uuid[]);

create or replace function public.lock_squad(
  p_match_id uuid, p_player_ids uuid[], p_guest_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_squad_size int;
  v_status     match_status_t;
  v_selected   int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select squad_size, status into v_squad_size, v_status from matches where id = p_match_id;
  if v_squad_size is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status in ('played', 'completed') then
    raise exception 'Oynanmis macin kadrosu degistirilemez';
  end if;

  v_selected := coalesce(array_length(p_player_ids, 1), 0)
              + coalesce(array_length(p_guest_ids, 1), 0);

  if v_selected <> v_squad_size then
    raise exception 'Kadro % kisi olmali, su an % kisi secili', v_squad_size, v_selected;
  end if;

  delete from match_squad where match_id = p_match_id;

  if array_length(p_player_ids, 1) is not null then
    insert into match_squad (match_id, player_id)
    select p_match_id, unnest(p_player_ids);
  end if;

  if array_length(p_guest_ids, 1) is not null then
    insert into match_squad (match_id, guest_id)
    select p_match_id, unnest(p_guest_ids);
  end if;

  update matches set status = 'squad_locked' where id = p_match_id;
end;
$$;

revoke all on function public.lock_squad(uuid, uuid[], uuid[]) from public;
grant execute on function public.lock_squad(uuid, uuid[], uuid[]) to authenticated;

-- Kesinlesmis kadroyu geri alir: kadro satirlari silinir, anket yeniden acilir.
-- Oynanmis/tamamlanmis maclarda calismaz; puan ve odeme kayitlari o asamada
-- kadroya dayandigi icin geri alma yalnizca kilit asamasinda anlamlidir.
create or replace function public.unlock_squad(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status <> 'squad_locked' then
    raise exception 'Yalnizca kadrosu kesinlesmis mac geri alinabilir';
  end if;

  delete from match_squad where match_id = p_match_id;
  update matches set status = 'poll_open' where id = p_match_id;
end;
$$;

revoke all on function public.unlock_squad(uuid) from public;
grant execute on function public.unlock_squad(uuid) to authenticated;

-- Admin bir uyeyi ya da aday oyuncuyu ankete elle ekler.
--
-- Giris zamani her zaman simdiki andir: elle eklenen kisi sirada en sona,
-- kendi giren herkesin arkasina yazilir. Daha once cikmis bir kayit varsa
-- yeniden acilir. Ofsete (ceza/odul) dokunulmaz; elle ekleme bir ceza
-- tuketimi degildir.
create or replace function public.admin_add_entry(
  p_match_id uuid, p_player_id uuid, p_guest_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if num_nonnulls(p_player_id, p_guest_id) <> 1 then
    raise exception 'Bir uye ya da bir aday oyuncu secilmeli';
  end if;

  if not exists (select 1 from matches where id = p_match_id and status = 'poll_open') then
    raise exception 'Anket kapali';
  end if;

  if p_player_id is not null then
    insert into match_entries (match_id, player_id)
    values (p_match_id, p_player_id)
    on conflict (match_id, player_id) where player_id is not null
    do update set withdrawn_at = null, is_late_withdrawal = false, entered_at = now();
  else
    insert into match_entries (match_id, guest_id)
    values (p_match_id, p_guest_id)
    on conflict (match_id, guest_id) where guest_id is not null
    do update set withdrawn_at = null, is_late_withdrawal = false, entered_at = now();
  end if;
end;
$$;

revoke all on function public.admin_add_entry(uuid, uuid, uuid) from public;
grant execute on function public.admin_add_entry(uuid, uuid, uuid) to authenticated;

-- Admin bir kaydi anketten tamamen siler. Cikis (leave_poll) degildir:
-- yanlislikla eklenen kisiyi temizler, bu yuzden gec cikis cezasi yazmaz.
create or replace function public.admin_remove_entry(
  p_match_id uuid, p_player_id uuid, p_guest_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if num_nonnulls(p_player_id, p_guest_id) <> 1 then
    raise exception 'Bir uye ya da bir aday oyuncu secilmeli';
  end if;

  if not exists (select 1 from matches where id = p_match_id and status = 'poll_open') then
    raise exception 'Anket kapali';
  end if;

  delete from match_entries
  where match_id = p_match_id
    and ((p_player_id is not null and player_id = p_player_id)
      or (p_guest_id  is not null and guest_id  = p_guest_id));
end;
$$;

revoke all on function public.admin_remove_entry(uuid, uuid, uuid) from public;
grant execute on function public.admin_remove_entry(uuid, uuid, uuid) to authenticated;

-- join_poll, (match_id, player_id) tekilligine ON CONFLICT ile dayaniyordu.
-- Bu tekillik yukarida kismi bir indekse cevrildigi icin (player_id artik null
-- olabiliyor) catisma hedefi de kismi indeksi secebilmek adina WHERE ile
-- daraltilmali. Govdenin geri kalani 0004'teki ile aynidir.
create or replace function public.join_poll(
  p_match_id uuid, p_player_id uuid, p_offset int, p_consumed_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_offset int;
begin
  if not exists (
    select 1 from matches where id = p_match_id and status = 'poll_open'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.system_operation', '1', true);

  insert into match_entries (match_id, player_id, entry_type, offset_seconds)
  values (p_match_id, p_player_id, 'standard', p_offset)
  on conflict (match_id, player_id) where player_id is not null do update
     set withdrawn_at       = null,
         is_late_withdrawal = false,
         entered_at         = now();

  if array_length(p_consumed_ids, 1) is not null then
    update adjustments
       set applied_match_id = p_match_id
     where id = any(p_consumed_ids)
       and player_id = p_player_id
       and applied_match_id is null;
  end if;

  select coalesce(sum(seconds), 0) into v_offset
    from adjustments
   where player_id = p_player_id and applied_match_id = p_match_id;

  update match_entries
     set offset_seconds = v_offset
   where match_id = p_match_id and player_id = p_player_id;

  perform set_config('app.system_operation', '0', true);
end;
$$;

revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from public;
revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from authenticated;
grant execute on function public.join_poll(uuid, uuid, int, uuid[]) to service_role;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0010_result.sql
-- Takim dagilimi ve skor: set_squad_teams, set_match_result, clear_match_result. Puan durumu bu kayitlardan turetilir.
-- -----------------------------------------------------------------------------

-- Takim dagilimi, skor ve puan durumu.
--
-- Kadro kesinlestikten sonra iki adim kalir: oyunculari siyah/beyaz takimlara
-- bolmek ve maci oynandiktan sonra skoru girmek. Puan durumu bu iki kayittan
-- turetilir; ayri bir puan tablosu tutulmaz, boylece skor duzeltildiginde
-- siralama kendiliginden guncellenir.

-- Kadrodaki herkesi tek islemde takimlara dagitir. Once butun satirlarin
-- takimi bosaltilir; boylece listeden cikarilan biri eski takiminda kalmaz.
-- Gonderilen id'ler match_squad.id'dir ve baska bir maca aitse yok sayilir.
create or replace function public.set_squad_teams(
  p_match_id uuid, p_black_ids uuid[], p_white_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'poll_open' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  update match_squad set team = null where match_id = p_match_id;

  if array_length(p_black_ids, 1) is not null then
    update match_squad set team = 'black'
     where match_id = p_match_id and id = any(p_black_ids);
  end if;

  if array_length(p_white_ids, 1) is not null then
    update match_squad set team = 'white'
     where match_id = p_match_id and id = any(p_white_ids);
  end if;
end;
$$;

revoke all on function public.set_squad_teams(uuid, uuid[], uuid[]) from public;
grant execute on function public.set_squad_teams(uuid, uuid[], uuid[]) to authenticated;

-- Skoru yazar ve maci oynandi durumuna gecirir. Iki takimda da en az bir
-- oyuncu olmadan skor girilemez: puan durumu takim uyeliginden hesaplandigi
-- icin takimsiz bir mac kimseye galibiyet/maglubiyet yazmaz, sessizce
-- kaybolurdu.
create or replace function public.set_match_result(
  p_match_id uuid, p_black_score int, p_white_score int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if p_black_score is null or p_white_score is null then
    raise exception 'Iki takimin da skoru girilmeli';
  end if;

  if p_black_score < 0 or p_white_score < 0 then
    raise exception 'Skor negatif olamaz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'poll_open' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  if not exists (select 1 from match_squad where match_id = p_match_id and team = 'black')
     or not exists (select 1 from match_squad where match_id = p_match_id and team = 'white') then
    raise exception 'Once oyunculari iki takima dagit';
  end if;

  update matches
     set black_score = p_black_score,
         white_score = p_white_score,
         status      = 'played'
   where id = p_match_id;
end;
$$;

revoke all on function public.set_match_result(uuid, int, int) from public;
grant execute on function public.set_match_result(uuid, int, int) to authenticated;

-- Yanlis girilen skoru siler ve maci kadro kesin durumuna geri dondurur.
-- Tamamlanmis (odemesi kapanmis) maclarda calismaz.
create or replace function public.clear_match_result(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status <> 'played' then
    raise exception 'Yalnizca oynanmis macin skoru silinebilir';
  end if;

  update matches
     set black_score = null, white_score = null, status = 'squad_locked'
   where id = p_match_id;
end;
$$;

revoke all on function public.clear_match_result(uuid) from public;
grant execute on function public.clear_match_result(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0011_cancel_match.sql
-- Hafta iptali: cancel_match ve restore_match. Iptal edilen hafta listede kalir, takvim o hafta icin yeni mac uretmez.
-- -----------------------------------------------------------------------------

-- Hafta iptali: tatil, kar, kontenjanin dolmamasi gibi sebeplerle o haftanin
-- maci oynanmaz.
--
-- Mac SILINMEZ, 'cancelled' durumuna alinir. Bunun iki sebebi var:
-- 1) Iptal edilen hafta listede kalir, oyuncular "bu hafta yok" bilgisini gorur.
-- 2) Haftalik takvim (ensure_scheduled_matches) ayni gun+saat icin zaten satir
--    varsa yenisini uretmez; satir durdugu surece iptal edilen hafta kendi
--    kendine geri acilmaz.
--
-- status_before_cancel iptal aninda onceki durumu saklar; geri alindiginda mac
-- tam olarak birakildigi yere doner.

alter type match_status_t add value if not exists 'cancelled';

alter table matches
  add column if not exists cancellation_reason  text,
  add column if not exists status_before_cancel match_status_t;

-- Oynanmis ya da odemesi kapanmis mac iptal edilemez: o hafta zaten yasandi.
create or replace function public.cancel_match(p_match_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Bu hafta zaten iptal edilmis';
  end if;

  if v_status in ('played', 'completed') then
    raise exception 'Oynanmis mac iptal edilemez';
  end if;

  update matches
     set status_before_cancel = status,
         status               = 'cancelled',
         cancellation_reason  = nullif(btrim(p_reason), '')
   where id = p_match_id;
end;
$$;

revoke all on function public.cancel_match(uuid, text) from public;
grant execute on function public.cancel_match(uuid, text) to authenticated;

-- Yanlislikla iptal edilen haftayi birakildigi duruma geri dondurur.
create or replace function public.restore_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
  v_before match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status, status_before_cancel into v_status, v_before
    from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status <> 'cancelled' then
    raise exception 'Yalnizca iptal edilmis hafta geri alinabilir';
  end if;

  update matches
     set status               = coalesce(v_before, 'poll_open'),
         status_before_cancel = null,
         cancellation_reason  = null
   where id = p_match_id;
end;
$$;

revoke all on function public.restore_match(uuid) from public;
grant execute on function public.restore_match(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0012_schedule_poll_day.sql
-- Anket gunu mac gununden ayrilir: match_schedules artik anketin kendi haftagunu ve saatini tutar.
-- -----------------------------------------------------------------------------

-- Anket gunu ile mac gunu ayrilir.
--
-- Onceki model anketi "mactan N gun once" aciyordu; bu, anket saatini zorunlu
-- olarak mac saatine esitliyordu. Gercekte ikisi bagimsiz: mac Persembe 22:15
-- oynanirken anket Pazartesi 12:00'de aciliyor. Gun sayisi yerine anketin kendi
-- haftagunu ve saati tutulur.
--
-- Anket ani, mactan onceki EN YAKIN (anket gunu + anket saati) anidir. Boylece
-- tanim her hafta kendiliginden dogru cift uretir.

alter table match_schedules
  add column if not exists poll_weekday   int  not null default 1 check (poll_weekday between 1 and 7),
  add column if not exists poll_open_time time not null default '12:00';

-- Eski tanimlar birebir korunur: mactan N gun onceki ayni saat.
update match_schedules
   set poll_weekday   = ((weekday - 1 - open_days_before) % 7 + 7) % 7 + 1,
       poll_open_time = start_time
 where open_days_before is not null;

alter table match_schedules drop column if exists open_days_before;

-- Mac satirina anketin acildigi an da yazilir; cekilme suresi ve listedeki
-- "anket ne zaman acildi" bilgisi buna bakar.
create or replace function public.ensure_scheduled_matches()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_schedule   record;
  v_today      date;
  v_delta      int;
  v_date       date;
  v_kickoff    timestamptz;
  v_poll_back  int;
  v_poll_open  timestamptz;
  v_season     uuid;
  v_week       int;
  v_created    int := 0;
begin
  -- Anonim ya da onay bekleyen kullanicilar takvimi tetikleyemez
  if not is_active_member() then
    return 0;
  end if;

  select id into v_season from seasons where is_active limit 1;

  -- Gun donumu Turkiye saatine gore hesaplanir; sunucu UTC calisir
  v_today := (now() at time zone 'Europe/Istanbul')::date;

  for v_schedule in select * from match_schedules where is_active loop
    -- Bu haftanin ilgili gunune kac gun var (bugunse 0)
    v_delta := (v_schedule.weekday - extract(isodow from v_today)::int + 7) % 7;

    for v_week in 0..9 loop
      v_date    := v_today + v_delta + v_week * 7;
      v_kickoff := (v_date + v_schedule.start_time) at time zone 'Europe/Istanbul';

      -- Mac gununden geriye giderek anket gunune inilir
      v_poll_back := (extract(isodow from v_date)::int - v_schedule.poll_weekday + 7) % 7;
      v_poll_open := ((v_date - v_poll_back) + v_schedule.poll_open_time)
                     at time zone 'Europe/Istanbul';
      -- Ayni gune denk gelip mactan sonraya dusuyorsa bir onceki haftadir
      if v_poll_open >= v_kickoff then
        v_poll_open := v_poll_open - interval '7 days';
      end if;

      -- Bu haftanin anketi henuz acilmadiysa sonrakiler daha da ileridedir
      exit when v_poll_open > now();

      if v_kickoff > now()
         and not exists (select 1 from matches where kickoff_at = v_kickoff)
      then
        begin
          insert into matches (
            season_id, schedule_id, kickoff_at, venue, squad_size, fee_per_player,
            withdrawal_window_hours, late_withdrawal_penalty_seconds, poll_opened_at
          ) values (
            v_season, v_schedule.id, v_kickoff, v_schedule.venue, v_schedule.squad_size,
            v_schedule.fee_per_player, v_schedule.withdrawal_window_hours,
            v_schedule.late_withdrawal_penalty_seconds, v_poll_open
          );
          v_created := v_created + 1;
        exception
          -- Baska bir istek ayni maci bizden once yazdi; sorun degil
          when unique_violation then null;
        end;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.ensure_scheduled_matches() from public;
grant execute on function public.ensure_scheduled_matches() to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0013_cancelled_guards.sql
-- Iptal edilmis haftaya kadro ve skor yazilmasini engelleyen ek kontroller.
-- -----------------------------------------------------------------------------

-- Iptal edilmis haftaya kadro/skor yazilamaz.
--
-- 0011 ile gelen 'cancelled' durumu, 0009 ve 0010'daki kontrolleri asiyordu:
-- lock_squad yalnizca 'played'/'completed' durumunu reddediyor, set_squad_teams
-- ve set_match_result ise yalnizca 'poll_open' durumunu reddediyordu. Bu
-- fonksiyonlar sayfada iptal edilmis hafta icin gosterilmiyor ama dogrudan
-- adres yazilarak cagrilabilirler; kural veritabaninda da durmali.

create or replace function public.lock_squad(
  p_match_id uuid, p_player_ids uuid[], p_guest_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_squad_size int;
  v_status     match_status_t;
  v_selected   int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select squad_size, status into v_squad_size, v_status from matches where id = p_match_id;
  if v_squad_size is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis haftanin kadrosu kesinlestirilemez';
  end if;

  if v_status in ('played', 'completed') then
    raise exception 'Oynanmis macin kadrosu degistirilemez';
  end if;

  v_selected := coalesce(array_length(p_player_ids, 1), 0)
              + coalesce(array_length(p_guest_ids, 1), 0);

  if v_selected <> v_squad_size then
    raise exception 'Kadro % kisi olmali, su an % kisi secili', v_squad_size, v_selected;
  end if;

  delete from match_squad where match_id = p_match_id;

  if array_length(p_player_ids, 1) is not null then
    insert into match_squad (match_id, player_id)
    select p_match_id, unnest(p_player_ids);
  end if;

  if array_length(p_guest_ids, 1) is not null then
    insert into match_squad (match_id, guest_id)
    select p_match_id, unnest(p_guest_ids);
  end if;

  update matches set status = 'squad_locked' where id = p_match_id;
end;
$$;

revoke all on function public.lock_squad(uuid, uuid[], uuid[]) from public;
grant execute on function public.lock_squad(uuid, uuid[], uuid[]) to authenticated;

create or replace function public.set_squad_teams(
  p_match_id uuid, p_black_ids uuid[], p_white_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta icin takim dagilimi yazilamaz';
  end if;

  if v_status = 'poll_open' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  update match_squad set team = null where match_id = p_match_id;

  if array_length(p_black_ids, 1) is not null then
    update match_squad set team = 'black'
     where match_id = p_match_id and id = any(p_black_ids);
  end if;

  if array_length(p_white_ids, 1) is not null then
    update match_squad set team = 'white'
     where match_id = p_match_id and id = any(p_white_ids);
  end if;
end;
$$;

revoke all on function public.set_squad_teams(uuid, uuid[], uuid[]) from public;
grant execute on function public.set_squad_teams(uuid, uuid[], uuid[]) to authenticated;

create or replace function public.set_match_result(
  p_match_id uuid, p_black_score int, p_white_score int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if p_black_score is null or p_white_score is null then
    raise exception 'Iki takimin da skoru girilmeli';
  end if;

  if p_black_score < 0 or p_white_score < 0 then
    raise exception 'Skor negatif olamaz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta icin skor girilemez';
  end if;

  if v_status = 'poll_open' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  if not exists (select 1 from match_squad where match_id = p_match_id and team = 'black')
     or not exists (select 1 from match_squad where match_id = p_match_id and team = 'white') then
    raise exception 'Once oyunculari iki takima dagit';
  end if;

  update matches
     set black_score = p_black_score,
         white_score = p_white_score,
         status      = 'played'
   where id = p_match_id;
end;
$$;

revoke all on function public.set_match_result(uuid, int, int) from public;
grant execute on function public.set_match_result(uuid, int, int) to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0014_team_names.sql
-- Takim adlari: takvimde ve mac satirinda tutulan, ekranda gorunen isimler; set_team_names.
-- -----------------------------------------------------------------------------

-- Takim adlari artik sabit degil.
--
-- Ic isleyis 'black'/'white' enum'uyla devam eder: puan durumu, skor kolonlari
-- ve eski kayitlar buna bagli. Degisen yalnizca ekranda gorunen ad. Ad hem
-- takvimde (her hafta tekrar yazmamak icin) hem macin kendi satirinda tutulur;
-- boylece adi sonradan degistirsen bile gecmis maclar oynandiklari adla kalir.

alter table match_schedules
  add column if not exists black_team_name text not null default 'Siyah',
  add column if not exists white_team_name text not null default 'Beyaz';

alter table matches
  add column if not exists black_team_name text not null default 'Siyah',
  add column if not exists white_team_name text not null default 'Beyaz';

do $$
begin
  alter table match_schedules
    add constraint match_schedules_team_names_len
    check (length(black_team_name) between 1 and 24
       and length(white_team_name) between 1 and 24);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table matches
    add constraint matches_team_names_len
    check (length(black_team_name) between 1 and 24
       and length(white_team_name) between 1 and 24);
exception when duplicate_object then null;
end $$;

-- Yeni mac dogarken takvimdeki adlar kopyalanir.
create or replace function public.ensure_scheduled_matches()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_schedule   record;
  v_today      date;
  v_delta      int;
  v_date       date;
  v_kickoff    timestamptz;
  v_poll_back  int;
  v_poll_open  timestamptz;
  v_season     uuid;
  v_week       int;
  v_created    int := 0;
begin
  -- Anonim ya da onay bekleyen kullanicilar takvimi tetikleyemez
  if not is_active_member() then
    return 0;
  end if;

  select id into v_season from seasons where is_active limit 1;

  -- Gun donumu Turkiye saatine gore hesaplanir; sunucu UTC calisir
  v_today := (now() at time zone 'Europe/Istanbul')::date;

  for v_schedule in select * from match_schedules where is_active loop
    -- Bu haftanin ilgili gunune kac gun var (bugunse 0)
    v_delta := (v_schedule.weekday - extract(isodow from v_today)::int + 7) % 7;

    for v_week in 0..9 loop
      v_date    := v_today + v_delta + v_week * 7;
      v_kickoff := (v_date + v_schedule.start_time) at time zone 'Europe/Istanbul';

      -- Mac gununden geriye giderek anket gunune inilir
      v_poll_back := (extract(isodow from v_date)::int - v_schedule.poll_weekday + 7) % 7;
      v_poll_open := ((v_date - v_poll_back) + v_schedule.poll_open_time)
                     at time zone 'Europe/Istanbul';
      -- Ayni gune denk gelip mactan sonraya dusuyorsa bir onceki haftadir
      if v_poll_open >= v_kickoff then
        v_poll_open := v_poll_open - interval '7 days';
      end if;

      -- Bu haftanin anketi henuz acilmadiysa sonrakiler daha da ileridedir
      exit when v_poll_open > now();

      if v_kickoff > now()
         and not exists (select 1 from matches where kickoff_at = v_kickoff)
      then
        begin
          insert into matches (
            season_id, schedule_id, kickoff_at, venue, squad_size, fee_per_player,
            withdrawal_window_hours, late_withdrawal_penalty_seconds, poll_opened_at,
            black_team_name, white_team_name
          ) values (
            v_season, v_schedule.id, v_kickoff, v_schedule.venue, v_schedule.squad_size,
            v_schedule.fee_per_player, v_schedule.withdrawal_window_hours,
            v_schedule.late_withdrawal_penalty_seconds, v_poll_open,
            v_schedule.black_team_name, v_schedule.white_team_name
          );
          v_created := v_created + 1;
        exception
          -- Baska bir istek ayni maci bizden once yazdi; sorun degil
          when unique_violation then null;
        end;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.ensure_scheduled_matches() from public;
grant execute on function public.ensure_scheduled_matches() to authenticated;

-- Tek bir macin takim adlarini degistirir. Bos birakilan ad varsayilana doner,
-- boylece admin adi silerek eski haline donebilir.
create or replace function public.set_team_names(
  p_match_id uuid, p_black_name text, p_white_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
  v_black  text := nullif(btrim(coalesce(p_black_name, '')), '');
  v_white  text := nullif(btrim(coalesce(p_white_name, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta icin takim adi degistirilemez';
  end if;

  update matches
     set black_team_name = left(coalesce(v_black, 'Siyah'), 24),
         white_team_name = left(coalesce(v_white, 'Beyaz'), 24)
   where id = p_match_id;
end;
$$;

revoke all on function public.set_team_names(uuid, text, text) from public;
grant execute on function public.set_team_names(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0015_guest_promotion.sql
-- Aday oyuncunun asil oyuncuya gecmesi: esigi dolduran adayi kendiliginden ceviren promote_eligible_guests ve elle karar icin promotion_locked.
-- -----------------------------------------------------------------------------

-- Aday oyuncunun asil oyuncuya gecmesi.
--
-- Aday oyuncu, Google hesabi olmadigi icin profiles'a yazilamaz; guest_players
-- satirinda kalir. "Asil oyuncu" burada bir etikettir: yeterince mac oynamis,
-- artik gruptan sayilan kisiyi isaretler. Google ile giris yapip uye olmasi
-- ayri bir istir ve bu bayrak onu engellemez.
--
-- Kural: belirlenen sayida mac oynayan aday kendiliginden asil olur. Admin
-- elle de degistirebilir; elle dokunulan kayda otomatik kural bir daha
-- karismaz (promotion_locked), yoksa sonraki mac onu geri ceviriyordu.

alter table guest_players
  add column if not exists is_regular       boolean not null default false,
  add column if not exists promoted_at      timestamptz,
  add column if not exists promotion_locked boolean not null default false;

-- Esik grup ayarlarinda durur; degistirmek icin migration gerekmesin.
alter table settings
  add column if not exists guest_promotion_matches int not null default 3;

do $$
begin
  alter table settings
    add constraint settings_guest_promotion_matches_ck
    check (guest_promotion_matches >= 1);
exception when duplicate_object then null;
end $$;

-- Esigi dolduran butun adaylari asil yapar ve kac kisiyi cevirdigini doner.
-- Yalnizca yukari yonde calisir: kimseyi adayliga geri dusurmez.
create or replace function public.promote_eligible_guests()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_threshold int;
  v_count     int;
begin
  select guest_promotion_matches into v_threshold from settings where id;
  v_threshold := coalesce(v_threshold, 3);

  with played as (
    select ms.guest_id, count(*) as match_count
      from match_squad ms
      join matches m on m.id = ms.match_id
     where ms.guest_id is not null
       and m.status in ('played', 'completed')
     group by ms.guest_id
  )
  update guest_players g
     set is_regular  = true,
         promoted_at = now()
    from played p
   where p.guest_id = g.id
     and p.match_count >= v_threshold
     and not g.is_regular
     and not g.promotion_locked;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.promote_eligible_guests() from public;
grant execute on function public.promote_eligible_guests() to authenticated;

create or replace function public.tg_promote_eligible_guests()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.promote_eligible_guests();
  return null;
end;
$$;

-- Iki ayri an: skor girilip mac "oynandi"ya gectiginde ve kadro satirlari
-- sonradan yazildiginda (demo verisi ile eski maclarda sira boyle isliyor).
drop trigger if exists matches_promote_guests on matches;
create trigger matches_promote_guests
  after update of status on matches
  for each row
  when (new.status in ('played', 'completed') and old.status is distinct from new.status)
  execute function public.tg_promote_eligible_guests();

drop trigger if exists match_squad_promote_guests on match_squad;
create trigger match_squad_promote_guests
  after insert on match_squad
  for each statement
  execute function public.tg_promote_eligible_guests();

-- Bugune kadar oynanmis maclar icin bir kez calistirilir.
select public.promote_eligible_guests();

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0016_teams.sql
-- Takim tanimi: teams tablosu, ayni anda iki aktif takim (active_slot 1/2) ve set_team_slot.
-- -----------------------------------------------------------------------------

-- Takim tanimi.
--
-- Takim adlari artik her takvimde/macta elle yazilmaz; ayri bir tabloda tanimli
-- dururlar. Ayni anda yalnizca iki takim aktiftir: active_slot = 1 ve 2. Kadro
-- dagitimi bu iki takima yapilir.
--
-- Slot, ic isleyisteki 'black'/'white' karsiligidir: 1 = black, 2 = white.
-- Boylece eski maclar, puan durumu ve skor kolonlari oldugu gibi calismaya
-- devam eder; degisen yalnizca ekranda gorunen ad.

create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 24),
  active_slot smallint check (active_slot in (1, 2)),
  created_at  timestamptz not null default now()
);

-- Bir slotta ayni anda tek takim durabilir
create unique index if not exists teams_active_slot_uniq
  on teams (active_slot) where active_slot is not null;
create unique index if not exists teams_name_uniq
  on teams (lower(btrim(name)));

alter table teams enable row level security;

do $$
begin
  create policy teams_select on teams for select using (is_active_member());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy teams_all on teams for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

-- Ilk kurulumda bugune kadar kullanilan iki ad hazir gelir
insert into teams (name, active_slot)
select * from (values ('Siyah', 1::smallint), ('Beyaz', 2::smallint)) as v(name, active_slot)
 where not exists (select 1 from teams);

-- Takimi bir slota alir ya da (p_slot null ise) pasife ceker. Slot dolu ise
-- oradaki takim once bosaltilir; tek islemde oldugu icin tekillik bozulmaz.
create or replace function public.set_team_slot(p_team_id uuid, p_slot smallint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if p_slot is not null and p_slot not in (1, 2) then
    raise exception 'Takim sirasi 1 ya da 2 olmali';
  end if;

  if not exists (select 1 from teams where id = p_team_id) then
    raise exception 'Takim bulunamadi';
  end if;

  if p_slot is null then
    update teams set active_slot = null where id = p_team_id;
    return;
  end if;

  update teams set active_slot = null
   where active_slot = p_slot and id <> p_team_id;

  update teams set active_slot = p_slot where id = p_team_id;
end;
$$;

revoke all on function public.set_team_slot(uuid, smallint) from public;
grant execute on function public.set_team_slot(uuid, smallint) to authenticated;

-- Takvimdeki ad kolonlari artik gereksiz: kaynak tek yerde, teams tablosunda.
alter table match_schedules
  drop column if exists black_team_name,
  drop column if exists white_team_name;

-- Yeni mac dogarken o an aktif olan iki takimin adi kopyalanir.
create or replace function public.ensure_scheduled_matches()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_schedule   record;
  v_today      date;
  v_delta      int;
  v_date       date;
  v_kickoff    timestamptz;
  v_poll_back  int;
  v_poll_open  timestamptz;
  v_season     uuid;
  v_week       int;
  v_created    int := 0;
  v_black      text;
  v_white      text;
begin
  -- Anonim ya da onay bekleyen kullanicilar takvimi tetikleyemez
  if not is_active_member() then
    return 0;
  end if;

  select id into v_season from seasons where is_active limit 1;

  select name into v_black from teams where active_slot = 1;
  select name into v_white from teams where active_slot = 2;
  v_black := coalesce(v_black, 'Siyah');
  v_white := coalesce(v_white, 'Beyaz');

  -- Gun donumu Turkiye saatine gore hesaplanir; sunucu UTC calisir
  v_today := (now() at time zone 'Europe/Istanbul')::date;

  for v_schedule in select * from match_schedules where is_active loop
    -- Bu haftanin ilgili gunune kac gun var (bugunse 0)
    v_delta := (v_schedule.weekday - extract(isodow from v_today)::int + 7) % 7;

    for v_week in 0..9 loop
      v_date    := v_today + v_delta + v_week * 7;
      v_kickoff := (v_date + v_schedule.start_time) at time zone 'Europe/Istanbul';

      -- Mac gununden geriye giderek anket gunune inilir
      v_poll_back := (extract(isodow from v_date)::int - v_schedule.poll_weekday + 7) % 7;
      v_poll_open := ((v_date - v_poll_back) + v_schedule.poll_open_time)
                     at time zone 'Europe/Istanbul';
      -- Ayni gune denk gelip mactan sonraya dusuyorsa bir onceki haftadir
      if v_poll_open >= v_kickoff then
        v_poll_open := v_poll_open - interval '7 days';
      end if;

      -- Bu haftanin anketi henuz acilmadiysa sonrakiler daha da ileridedir
      exit when v_poll_open > now();

      if v_kickoff > now()
         and not exists (select 1 from matches where kickoff_at = v_kickoff)
      then
        begin
          insert into matches (
            season_id, schedule_id, kickoff_at, venue, squad_size, fee_per_player,
            withdrawal_window_hours, late_withdrawal_penalty_seconds, poll_opened_at,
            black_team_name, white_team_name
          ) values (
            v_season, v_schedule.id, v_kickoff, v_schedule.venue, v_schedule.squad_size,
            v_schedule.fee_per_player, v_schedule.withdrawal_window_hours,
            v_schedule.late_withdrawal_penalty_seconds, v_poll_open,
            v_black, v_white
          );
          v_created := v_created + 1;
        exception
          -- Baska bir istek ayni maci bizden once yazdi; sorun degil
          when unique_violation then null;
        end;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.ensure_scheduled_matches() from public;
grant execute on function public.ensure_scheduled_matches() to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0017_payments.sql
-- Mac muhasebesi: kisi bazli odeme (match_squad.amount_paid), set_payment, complete_match, reopen_match_payments.
-- -----------------------------------------------------------------------------

-- Mac muhasebesi: kisi bazli odeme kaydi.
--
-- Odeme, macin kadrosuna baglidir: parayi o hafta sahaya cikan kisi oder.
-- Beklenen tutar macin fee_per_player'idir; satirda yalnizca odenen tutar
-- tutulur, boylece eksik odeme de yazilabilir.
--
-- Butun odemeler tamamlaninca mac 'completed' olur. 'played' -> 'completed'
-- gecisi yalnizca buradan yapilir; skor ve puan durumu bundan etkilenmez.

alter table match_squad
  add column if not exists amount_paid numeric(10,2) not null default 0,
  add column if not exists paid_at     timestamptz;

do $$
begin
  alter table match_squad
    add constraint match_squad_amount_paid_ck check (amount_paid >= 0);
exception when duplicate_object then null;
end $$;

-- Tek kisinin odemesini yazar. Tutar 0 ise odeme silinmis sayilir.
create or replace function public.set_payment(p_squad_id uuid, p_amount numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Tutar negatif olamaz';
  end if;

  select m.status into v_status
    from match_squad ms join matches m on m.id = ms.match_id
   where ms.id = p_squad_id;

  if v_status is null then
    raise exception 'Kadro satiri bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta icin odeme yazilamaz';
  end if;

  update match_squad
     set amount_paid = p_amount,
         paid_at     = case when p_amount > 0 then coalesce(paid_at, now()) else null end
   where id = p_squad_id;
end;
$$;

revoke all on function public.set_payment(uuid, numeric) from public;
grant execute on function public.set_payment(uuid, numeric) to authenticated;

-- Oynanmis macin odemeleri kapanir. Eksik odeme varsa kac kisi kaldigini soyler.
create or replace function public.complete_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match   record;
  v_missing int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status, fee_per_player into v_match from matches where id = p_match_id;
  if v_match is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_match.status <> 'played' then
    raise exception 'Once skoru gir';
  end if;

  select count(*) into v_missing
    from match_squad
   where match_id = p_match_id and amount_paid < v_match.fee_per_player;

  if v_missing > 0 then
    raise exception 'Odemesi eksik % kisi var', v_missing;
  end if;

  update matches set status = 'completed' where id = p_match_id;
end;
$$;

revoke all on function public.complete_match(uuid) from public;
grant execute on function public.complete_match(uuid) to authenticated;

-- Yanlis kapatilan muhasebe geri acilir; odeme kayitlari yerinde kalir.
create or replace function public.reopen_match_payments(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status <> 'completed' then
    raise exception 'Yalnizca kapanmis mac geri acilabilir';
  end if;

  update matches set status = 'played' where id = p_match_id;
end;
$$;

revoke all on function public.reopen_match_payments(uuid) from public;
grant execute on function public.reopen_match_payments(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0018_ratings.sql
-- Mac sonrasi oylama ve yorumlar: match_ratings, match_comments, rate_player ve skor beklemeden oynandi yapan mark_match_played.
-- -----------------------------------------------------------------------------

-- Mac sonrasi oylama ve yorumlar.
--
-- Mac oynandiktan sonra kadrodaki uyeler birbirine 1-5 yildiz verir ve mac icin
-- yorum yazar. Oylar gizlidir: kimin kime kac verdigini yalnizca yonetici gorur,
-- oyuncu yalnizca kendi verdigi oylari gorur. Yorumlar herkese aciktir.
--
-- Aday oyuncular Google hesabi olmadigi icin oy VEREMEZ ama oy ALABILIR;
-- bu yuzden oy verilen taraf uye ya da aday olabilir (num_nonnulls = 1).

-- Skor girmeden de maci oynandi durumuna almak icin. Oylama skoru beklemesin:
-- maci ertesi gun puanlamak isteyen admin skoru sonra girebilir.
create or replace function public.mark_match_played(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta oynandi yapilamaz';
  end if;

  if v_status <> 'squad_locked' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  update matches set status = 'played' where id = p_match_id;
end;
$$;

revoke all on function public.mark_match_played(uuid) from public;
grant execute on function public.mark_match_played(uuid) to authenticated;

create table if not exists match_ratings (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references matches(id) on delete cascade,
  rater_id        uuid not null references profiles(id) on delete cascade,
  ratee_player_id uuid references profiles(id) on delete cascade,
  ratee_guest_id  uuid references guest_players(id) on delete cascade,
  stars           smallint not null check (stars between 1 and 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint match_ratings_ratee_ck check (num_nonnulls(ratee_player_id, ratee_guest_id) = 1),
  constraint match_ratings_self_ck  check (ratee_player_id is distinct from rater_id)
);

create unique index if not exists match_ratings_player_uniq
  on match_ratings (match_id, rater_id, ratee_player_id) where ratee_player_id is not null;
create unique index if not exists match_ratings_guest_uniq
  on match_ratings (match_id, rater_id, ratee_guest_id) where ratee_guest_id is not null;

alter table match_ratings enable row level security;

do $$
begin
  -- Oyuncu yalnizca kendi verdigi oylari okur; hepsini yonetici gorur
  create policy match_ratings_select on match_ratings for select
    using (is_admin() or rater_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy match_ratings_admin on match_ratings for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

create table if not exists match_comments (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists match_comments_match_idx on match_comments (match_id, created_at);

alter table match_comments enable row level security;

do $$
begin
  create policy match_comments_select on match_comments for select
    using (is_active_member());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy match_comments_insert on match_comments for insert
    with check (is_active_member() and author_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  -- Kendi yorumunu silebilirsin; yonetici hepsini silebilir
  create policy match_comments_delete on match_comments for delete
    using (is_admin() or author_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- Oy verme. Kurallar tek yerde toplanir:
--   - mac oynanmis (ya da kapanmis) olmali
--   - oy veren aktif uye olmali ve ya kadroda olmali ya da yonetici olmali
--   - oy verilen o macin kadrosunda olmali
--   - kimse kendine oy veremez
-- Ayni kisiye tekrar oy verilirse yildiz guncellenir.
create or replace function public.rate_player(
  p_match_id uuid, p_ratee_player_id uuid, p_ratee_guest_id uuid, p_stars smallint
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
  v_rater  uuid := auth.uid();
begin
  if not is_active_member() then
    raise exception 'Yetkisiz';
  end if;

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Yildiz 1 ile 5 arasinda olmali';
  end if;

  if num_nonnulls(p_ratee_player_id, p_ratee_guest_id) <> 1 then
    raise exception 'Oy verilen kisi belirsiz';
  end if;

  if p_ratee_player_id = v_rater then
    raise exception 'Kendine oy veremezsin';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status not in ('played', 'completed') then
    raise exception 'Oylama mac oynandi olarak isaretlenince acilir';
  end if;

  if not public.is_admin()
     and not exists (
       select 1 from match_squad
        where match_id = p_match_id and player_id = v_rater
     ) then
    raise exception 'Bu macin kadrosunda degilsin';
  end if;

  if not exists (
    select 1 from match_squad
     where match_id = p_match_id
       and ((p_ratee_player_id is not null and player_id = p_ratee_player_id)
         or (p_ratee_guest_id  is not null and guest_id  = p_ratee_guest_id))
  ) then
    raise exception 'Oy verilen kisi bu macin kadrosunda degil';
  end if;

  if p_ratee_player_id is not null then
    insert into match_ratings (match_id, rater_id, ratee_player_id, stars)
    values (p_match_id, v_rater, p_ratee_player_id, p_stars)
    on conflict (match_id, rater_id, ratee_player_id) where ratee_player_id is not null
    do update set stars = excluded.stars, updated_at = now();
  else
    insert into match_ratings (match_id, rater_id, ratee_guest_id, stars)
    values (p_match_id, v_rater, p_ratee_guest_id, p_stars)
    on conflict (match_id, rater_id, ratee_guest_id) where ratee_guest_id is not null
    do update set stars = excluded.stars, updated_at = now();
  end if;
end;
$$;

revoke all on function public.rate_player(uuid, uuid, uuid, smallint) from public;
grant execute on function public.rate_player(uuid, uuid, uuid, smallint) to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0019_mvp.sql
-- Oylama bitis ani, MVP secimi (finalize_due_mvps), genel yildiz ezme (override_rating) ve MVP'nin sonraki ankette VIP olmasi (vip_grants).
-- -----------------------------------------------------------------------------

-- Oylama bitisi, MVP ve MVP'nin bir sonraki ankette VIP hakki.
--
-- 1) Yonetici kendine de oy verebilir; sinir yalnizca normal oyuncuya kalir.
-- 2) Her oyuncunun bir "genel yildiz"i vardir: butun maclardan gelen ortalama.
--    Yonetici bu ortalamayi elle ezebilir (override_rating).
-- 3) Mac oynandi olarak isaretlenince oylama icin bir bitis ani yazilir.
--    Sure dolunca o macin MVP'si oylardan hesaplanir.
-- 4) MVP, bir sonraki anket acildigi anda VIP olarak listeye yazilir.

-- 1) Kendine oy verme sinirini tablo seviyesinden al; karar rate_player'da
alter table match_ratings drop constraint if exists match_ratings_self_ck;

-- 2) Elle yazilan genel yildiz. Bos ise ortalama gecerlidir.
alter table profiles      add column if not exists override_rating numeric(2,1);
alter table guest_players add column if not exists override_rating numeric(2,1);

do $$
begin
  alter table profiles add constraint profiles_override_rating_ck
    check (override_rating is null or override_rating between 1 and 5);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table guest_players add constraint guest_players_override_rating_ck
    check (override_rating is null or override_rating between 1 and 5);
exception when duplicate_object then null;
end $$;

-- 3) Oylama penceresi ve MVP
alter table matches
  add column if not exists voting_closes_at timestamptz,
  add column if not exists mvp_player_id uuid references profiles(id) on delete set null,
  add column if not exists mvp_guest_id  uuid references guest_players(id) on delete set null;

do $$
begin
  alter table matches add constraint matches_mvp_ck
    check (num_nonnulls(mvp_player_id, mvp_guest_id) <= 1);
exception when duplicate_object then null;
end $$;

alter table settings
  add column if not exists voting_window_hours int not null default 48;

do $$
begin
  alter table settings add constraint settings_voting_window_ck
    check (voting_window_hours between 1 and 720);
exception when duplicate_object then null;
end $$;

-- Mac oynandi olunca oylama suresi kendiliginden baslar. Hangi yoldan
-- gecildigi onemli degil (skor girilmesi de mark_match_played de ayni yere
-- ciktigi icin karar tetikleyicide toplanir).
create or replace function public.tg_start_voting_window()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'played'
     and old.status is distinct from 'played'
     and new.voting_closes_at is null then
    new.voting_closes_at := now()
      + make_interval(hours => coalesce((select voting_window_hours from settings where id), 48));
  end if;
  return new;
end;
$$;

drop trigger if exists matches_voting_window on matches;
create trigger matches_voting_window
  before update of status on matches
  for each row
  execute function public.tg_start_voting_window();

-- Bitis anini yonetici elle de degistirebilir.
create or replace function public.set_voting_deadline(
  p_match_id uuid, p_closes_at timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if not exists (select 1 from matches where id = p_match_id) then
    raise exception 'Mac bulunamadi';
  end if;

  update matches set voting_closes_at = p_closes_at where id = p_match_id;
end;
$$;

revoke all on function public.set_voting_deadline(uuid, timestamptz) from public;
grant execute on function public.set_voting_deadline(uuid, timestamptz) to authenticated;

-- 4) MVP'nin bir sonraki ankette kullanacagi VIP hakki
create table if not exists vip_grants (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid references profiles(id) on delete cascade,
  guest_id         uuid references guest_players(id) on delete cascade,
  source_match_id  uuid not null references matches(id) on delete cascade,
  applied_match_id uuid references matches(id) on delete set null,
  reason           text not null default 'MVP',
  created_at       timestamptz not null default now(),
  constraint vip_grants_participant_ck check (num_nonnulls(player_id, guest_id) = 1)
);

-- Bir macin MVP'si icin tek hak uretilir
create unique index if not exists vip_grants_source_uniq on vip_grants (source_match_id);

alter table vip_grants enable row level security;

do $$
begin
  create policy vip_grants_select on vip_grants for select using (is_active_member());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy vip_grants_all on vip_grants for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

-- Oy verme kurallari yeniden: yonetici kendine de verebilir, sure dolunca
-- kimse veremez.
create or replace function public.rate_player(
  p_match_id uuid, p_ratee_player_id uuid, p_ratee_guest_id uuid, p_stars smallint
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match  record;
  v_rater  uuid := auth.uid();
  v_admin  boolean := public.is_admin();
begin
  if not is_active_member() then
    raise exception 'Yetkisiz';
  end if;

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Yildiz 1 ile 5 arasinda olmali';
  end if;

  if num_nonnulls(p_ratee_player_id, p_ratee_guest_id) <> 1 then
    raise exception 'Oy verilen kisi belirsiz';
  end if;

  -- Kendine oy verme yalnizca yoneticiye acik
  if p_ratee_player_id = v_rater and not v_admin then
    raise exception 'Kendine oy veremezsin';
  end if;

  select status, voting_closes_at into v_match from matches where id = p_match_id;
  if v_match is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_match.status not in ('played', 'completed') then
    raise exception 'Oylama mac oynandi olarak isaretlenince acilir';
  end if;

  if v_match.voting_closes_at is not null and v_match.voting_closes_at <= now() then
    raise exception 'Oylama suresi doldu';
  end if;

  if not v_admin
     and not exists (
       select 1 from match_squad
        where match_id = p_match_id and player_id = v_rater
     ) then
    raise exception 'Bu macin kadrosunda degilsin';
  end if;

  if not exists (
    select 1 from match_squad
     where match_id = p_match_id
       and ((p_ratee_player_id is not null and player_id = p_ratee_player_id)
         or (p_ratee_guest_id  is not null and guest_id  = p_ratee_guest_id))
  ) then
    raise exception 'Oy verilen kisi bu macin kadrosunda degil';
  end if;

  if p_ratee_player_id is not null then
    insert into match_ratings (match_id, rater_id, ratee_player_id, stars)
    values (p_match_id, v_rater, p_ratee_player_id, p_stars)
    on conflict (match_id, rater_id, ratee_player_id) where ratee_player_id is not null
    do update set stars = excluded.stars, updated_at = now();
  else
    insert into match_ratings (match_id, rater_id, ratee_guest_id, stars)
    values (p_match_id, v_rater, p_ratee_guest_id, p_stars)
    on conflict (match_id, rater_id, ratee_guest_id) where ratee_guest_id is not null
    do update set stars = excluded.stars, updated_at = now();
  end if;
end;
$$;

revoke all on function public.rate_player(uuid, uuid, uuid, smallint) from public;
grant execute on function public.rate_player(uuid, uuid, uuid, smallint) to authenticated;

-- Yorumlar da bitis aninda kapanir; kural RLS'te durur ki dogrudan istek de
-- ayni sinira takilsin.
drop policy if exists match_comments_insert on match_comments;
create policy match_comments_insert on match_comments for insert
  with check (
    is_active_member()
    and author_id = auth.uid()
    and exists (
      select 1 from matches m
       where m.id = match_id
         and (m.voting_closes_at is null or m.voting_closes_at > now())
    )
  );

-- Suresi dolmus maclarin MVP'sini hesaplar. En yuksek ortalama kazanir;
-- esitlikte daha cok oy alan, o da esitse ada gore ilk gelen.
-- Her cagrida yalnizca MVP'si belirlenmemis maclara bakar.
create or replace function public.finalize_due_mvps()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_match  record;
  v_best   record;
  v_count  int := 0;
begin
  if not is_active_member() then
    return 0;
  end if;

  for v_match in
    select id from matches
     where status in ('played', 'completed')
       and voting_closes_at is not null
       and voting_closes_at <= now()
       and mvp_player_id is null
       and mvp_guest_id is null
  loop
    select r.ratee_player_id, r.ratee_guest_id,
           avg(r.stars) as average, count(*) as votes
      into v_best
      from match_ratings r
     where r.match_id = v_match.id
     group by r.ratee_player_id, r.ratee_guest_id
     order by avg(r.stars) desc, count(*) desc
     limit 1;

    -- Hic oy verilmemisse MVP yok; kayit dokunulmadan kalir, oy gelirse
    -- sonraki cagrida yeniden bakilir.
    if not found then
      continue;
    end if;

    update matches
       set mvp_player_id = v_best.ratee_player_id,
           mvp_guest_id  = v_best.ratee_guest_id
     where id = v_match.id;

    insert into vip_grants (player_id, guest_id, source_match_id)
    values (v_best.ratee_player_id, v_best.ratee_guest_id, v_match.id)
    on conflict (source_match_id) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.finalize_due_mvps() from public;
grant execute on function public.finalize_due_mvps() to authenticated;

-- Genel yildiz ozeti. match_ratings satirlarini kimse goremez (RLS), ama
-- ortalama herkese aciktir: bu fonksiyon yalnizca toplami dondurur, kimin
-- ne verdigini sizdirmaz.
create or replace function public.rating_summary()
returns table (participant_id uuid, is_guest boolean, average numeric, votes int)
language sql security definer set search_path = public as $$
  select coalesce(ratee_player_id, ratee_guest_id) as participant_id,
         ratee_player_id is null                   as is_guest,
         round(avg(stars)::numeric, 1)             as average,
         count(*)::int                             as votes
    from match_ratings
   where is_active_member()
   group by 1, 2;
$$;

revoke all on function public.rating_summary() from public;
grant execute on function public.rating_summary() to authenticated;

-- Yeni mac dogarken bekleyen VIP haklari listeye yazilir: MVP, anket acilir
-- acilmaz kadroda olur.
create or replace function public.ensure_scheduled_matches()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_schedule   record;
  v_today      date;
  v_delta      int;
  v_date       date;
  v_kickoff    timestamptz;
  v_poll_back  int;
  v_poll_open  timestamptz;
  v_season     uuid;
  v_week       int;
  v_created    int := 0;
  v_black      text;
  v_white      text;
  v_match_id   uuid;
begin
  -- Anonim ya da onay bekleyen kullanicilar takvimi tetikleyemez
  if not is_active_member() then
    return 0;
  end if;

  select id into v_season from seasons where is_active limit 1;

  select name into v_black from teams where active_slot = 1;
  select name into v_white from teams where active_slot = 2;
  v_black := coalesce(v_black, 'Siyah');
  v_white := coalesce(v_white, 'Beyaz');

  -- Gun donumu Turkiye saatine gore hesaplanir; sunucu UTC calisir
  v_today := (now() at time zone 'Europe/Istanbul')::date;

  for v_schedule in select * from match_schedules where is_active loop
    -- Bu haftanin ilgili gunune kac gun var (bugunse 0)
    v_delta := (v_schedule.weekday - extract(isodow from v_today)::int + 7) % 7;

    for v_week in 0..9 loop
      v_date    := v_today + v_delta + v_week * 7;
      v_kickoff := (v_date + v_schedule.start_time) at time zone 'Europe/Istanbul';

      -- Mac gununden geriye giderek anket gunune inilir
      v_poll_back := (extract(isodow from v_date)::int - v_schedule.poll_weekday + 7) % 7;
      v_poll_open := ((v_date - v_poll_back) + v_schedule.poll_open_time)
                     at time zone 'Europe/Istanbul';
      -- Ayni gune denk gelip mactan sonraya dusuyorsa bir onceki haftadir
      if v_poll_open >= v_kickoff then
        v_poll_open := v_poll_open - interval '7 days';
      end if;

      -- Bu haftanin anketi henuz acilmadiysa sonrakiler daha da ileridedir
      exit when v_poll_open > now();

      if v_kickoff > now()
         and not exists (select 1 from matches where kickoff_at = v_kickoff)
      then
        begin
          insert into matches (
            season_id, schedule_id, kickoff_at, venue, squad_size, fee_per_player,
            withdrawal_window_hours, late_withdrawal_penalty_seconds, poll_opened_at,
            black_team_name, white_team_name
          ) values (
            v_season, v_schedule.id, v_kickoff, v_schedule.venue, v_schedule.squad_size,
            v_schedule.fee_per_player, v_schedule.withdrawal_window_hours,
            v_schedule.late_withdrawal_penalty_seconds, v_poll_open,
            v_black, v_white
          )
          returning id into v_match_id;
          v_created := v_created + 1;

          -- 0003'teki alan korumasi sistem yazimlarina izin versin
          perform set_config('app.system_operation', '1', true);

          insert into match_entries (match_id, player_id, guest_id, entry_type, vip_rank)
          select v_match_id, g.player_id, g.guest_id, 'vip', 1
            from vip_grants g
           where g.applied_match_id is null;

          update vip_grants
             set applied_match_id = v_match_id
           where applied_match_id is null;

          perform set_config('app.system_operation', '0', true);
        exception
          -- Baska bir istek ayni maci bizden once yazdi; sorun degil
          when unique_violation then null;
        end;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.ensure_scheduled_matches() from public;
grant execute on function public.ensure_scheduled_matches() to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0020_sponsor.sql
-- Haftanin sponsoru: macin kendi satirinda tutulan, bos birakilabilen sponsor adi.
-- -----------------------------------------------------------------------------

-- Haftanin sponsoru.
--
-- Bazi haftalarda saha ucretini bir kisi ya da bir isyeri ustleniyor. Bu, o
-- haftaya ait bir bilgi oldugu icin takvimde degil macin kendi satirinda durur;
-- bos ise hicbir yerde gorunmez.

alter table matches
  add column if not exists sponsor_name text not null default '';

do $$
begin
  alter table matches add constraint matches_sponsor_name_len
    check (length(sponsor_name) <= 60);
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0021_ledger.sql
-- Kasa: oyuncu odemeleri disindaki gelir ve giderler (ledger_entries), sabit kategoriler ve serbest aciklama.
-- -----------------------------------------------------------------------------

-- Kasa: oyuncu odemeleri disindaki gelir ve giderler.
--
-- Oyunculardan toplanan para zaten match_squad.amount_paid'de duruyor; burada
-- tekrar yazilmaz, yoksa iki kez sayilirdi. Bu tablo bagis gibi ek gelirleri ve
-- saha ucreti, ikram, ek masraf gibi giderleri tutar.
--
-- Kasa bakiyesi = toplanan odemeler + buradaki gelirler - buradaki giderler.

do $$
begin
  create type ledger_direction_t as enum ('income', 'expense');
exception when duplicate_object then null;
end $$;

-- Kategoriler sabit: rapor hep ayni basliklarla ciksin. Serbest aciklama
-- description alaninda durur.
do $$
begin
  create type ledger_category_t as enum (
    'donation',        -- bagis
    'other_income',    -- diger gelir
    'field_fee',       -- hali saha ucreti
    'refreshment',     -- ikram
    'equipment',       -- malzeme
    'other_expense'    -- ek masraf
  );
exception when duplicate_object then null;
end $$;

create table if not exists ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid references seasons(id) on delete set null,
  match_id    uuid references matches(id) on delete set null,
  direction   ledger_direction_t not null,
  category    ledger_category_t  not null,
  amount      numeric(10,2) not null check (amount > 0),
  description text not null default '',
  occurred_on date not null default (now() at time zone 'Europe/Istanbul')::date,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint ledger_entries_description_len check (length(description) <= 200)
);

create index if not exists ledger_entries_season_idx
  on ledger_entries (season_id, occurred_on desc);

alter table ledger_entries enable row level security;

do $$
begin
  -- Kasa seffaftir: butun aktif uyeler okuyabilir, yalnizca yonetici yazar
  create policy ledger_entries_select on ledger_entries for select using (is_active_member());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy ledger_entries_all on ledger_entries for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0022_player_tier.sql
-- Sabit (VIP) ve oncelikli oyuncu tanimi: profiles/guest_players.tier, anket acilirken VIPlerin listeye yazilmasi ve sync_open_poll_tiers.
-- -----------------------------------------------------------------------------

-- Sabit (VIP) ve oncelikli oyuncu tanimi.
--
-- Siralama bastan beri uc katmanli: VIP -> oncelikli -> normal. Bugune kadar
-- katman yalnizca anket satirinda (match_entries.entry_type) duruyordu ve
-- hicbir yerden yazilmiyordu. Artik katman kisinin kendisinde durur; anket
-- satirlari bu tanimdan dogar.
--
-- VIP ayrica "sabit oyuncu" demektir: anket acildigi anda listeye kendiliginden
-- yazilir, girmesine gerek kalmaz. Sirasi vip_rank ile belirlenir (kucuk olan
-- once), bos ise VIP'ler kendi aralarinda yazilma sirasina gore dizilir.

alter table profiles
  add column if not exists tier     entry_type_t not null default 'standard',
  add column if not exists vip_rank int;

alter table guest_players
  add column if not exists tier     entry_type_t not null default 'standard',
  add column if not exists vip_rank int;

-- Ankete kendi giren uyenin katmani profilinden gelir.
create or replace function public.join_poll(
  p_match_id uuid, p_player_id uuid, p_offset int, p_consumed_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_offset int;
  v_tier   entry_type_t;
  v_rank   int;
begin
  if not exists (
    select 1 from matches where id = p_match_id and status = 'poll_open'
  ) then
    raise exception 'Anket kapali';
  end if;

  select tier, vip_rank into v_tier, v_rank from profiles where id = p_player_id;
  v_tier := coalesce(v_tier, 'standard');

  perform set_config('app.system_operation', '1', true);

  -- Katman her girise yeniden yazilir: admin birini VIP yaptiginda acik
  -- ankette de gecerli olsun.
  insert into match_entries (match_id, player_id, entry_type, vip_rank, offset_seconds)
  values (p_match_id, p_player_id, v_tier, v_rank, p_offset)
  on conflict (match_id, player_id) where player_id is not null do update
     set withdrawn_at       = null,
         is_late_withdrawal = false,
         entered_at         = now(),
         entry_type         = excluded.entry_type,
         vip_rank           = excluded.vip_rank;

  if array_length(p_consumed_ids, 1) is not null then
    update adjustments
       set applied_match_id = p_match_id
     where id = any(p_consumed_ids)
       and player_id = p_player_id
       and applied_match_id is null;
  end if;

  select coalesce(sum(seconds), 0) into v_offset
    from adjustments
   where player_id = p_player_id and applied_match_id = p_match_id;

  update match_entries
     set offset_seconds = v_offset
   where match_id = p_match_id and player_id = p_player_id;

  perform set_config('app.system_operation', '0', true);
end;
$$;

revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from public;
revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from authenticated;
grant execute on function public.join_poll(uuid, uuid, int, uuid[]) to service_role;

-- Admin'in elle ekledigi kisi de kendi katmaniyla girer.
create or replace function public.admin_add_entry(
  p_match_id uuid, p_player_id uuid, p_guest_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tier entry_type_t;
  v_rank int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if num_nonnulls(p_player_id, p_guest_id) <> 1 then
    raise exception 'Bir uye ya da bir aday oyuncu secilmeli';
  end if;

  if not exists (select 1 from matches where id = p_match_id and status = 'poll_open') then
    raise exception 'Anket kapali';
  end if;

  if p_player_id is not null then
    select tier, vip_rank into v_tier, v_rank from profiles where id = p_player_id;
    v_tier := coalesce(v_tier, 'standard');

    insert into match_entries (match_id, player_id, entry_type, vip_rank)
    values (p_match_id, p_player_id, v_tier, v_rank)
    on conflict (match_id, player_id) where player_id is not null
    do update set withdrawn_at = null, is_late_withdrawal = false, entered_at = now(),
                  entry_type = excluded.entry_type, vip_rank = excluded.vip_rank;
  else
    select tier, vip_rank into v_tier, v_rank from guest_players where id = p_guest_id;
    v_tier := coalesce(v_tier, 'standard');

    insert into match_entries (match_id, guest_id, entry_type, vip_rank)
    values (p_match_id, p_guest_id, v_tier, v_rank)
    on conflict (match_id, guest_id) where guest_id is not null
    do update set withdrawn_at = null, is_late_withdrawal = false, entered_at = now(),
                  entry_type = excluded.entry_type, vip_rank = excluded.vip_rank;
  end if;
end;
$$;

revoke all on function public.admin_add_entry(uuid, uuid, uuid) from public;
grant execute on function public.admin_add_entry(uuid, uuid, uuid) to authenticated;

-- Anket acilir acilmaz sabit oyuncular listeye yazilir. MVP'nin tek seferlik
-- VIP hakki da ayni anda islenir.
create or replace function public.ensure_scheduled_matches()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_schedule   record;
  v_today      date;
  v_delta      int;
  v_date       date;
  v_kickoff    timestamptz;
  v_poll_back  int;
  v_poll_open  timestamptz;
  v_season     uuid;
  v_week       int;
  v_created    int := 0;
  v_black      text;
  v_white      text;
  v_match_id   uuid;
begin
  -- Anonim ya da onay bekleyen kullanicilar takvimi tetikleyemez
  if not is_active_member() then
    return 0;
  end if;

  select id into v_season from seasons where is_active limit 1;

  select name into v_black from teams where active_slot = 1;
  select name into v_white from teams where active_slot = 2;
  v_black := coalesce(v_black, 'Siyah');
  v_white := coalesce(v_white, 'Beyaz');

  -- Gun donumu Turkiye saatine gore hesaplanir; sunucu UTC calisir
  v_today := (now() at time zone 'Europe/Istanbul')::date;

  for v_schedule in select * from match_schedules where is_active loop
    -- Bu haftanin ilgili gunune kac gun var (bugunse 0)
    v_delta := (v_schedule.weekday - extract(isodow from v_today)::int + 7) % 7;

    for v_week in 0..9 loop
      v_date    := v_today + v_delta + v_week * 7;
      v_kickoff := (v_date + v_schedule.start_time) at time zone 'Europe/Istanbul';

      -- Mac gununden geriye giderek anket gunune inilir
      v_poll_back := (extract(isodow from v_date)::int - v_schedule.poll_weekday + 7) % 7;
      v_poll_open := ((v_date - v_poll_back) + v_schedule.poll_open_time)
                     at time zone 'Europe/Istanbul';
      -- Ayni gune denk gelip mactan sonraya dusuyorsa bir onceki haftadir
      if v_poll_open >= v_kickoff then
        v_poll_open := v_poll_open - interval '7 days';
      end if;

      -- Bu haftanin anketi henuz acilmadiysa sonrakiler daha da ileridedir
      exit when v_poll_open > now();

      if v_kickoff > now()
         and not exists (select 1 from matches where kickoff_at = v_kickoff)
      then
        begin
          insert into matches (
            season_id, schedule_id, kickoff_at, venue, squad_size, fee_per_player,
            withdrawal_window_hours, late_withdrawal_penalty_seconds, poll_opened_at,
            black_team_name, white_team_name
          ) values (
            v_season, v_schedule.id, v_kickoff, v_schedule.venue, v_schedule.squad_size,
            v_schedule.fee_per_player, v_schedule.withdrawal_window_hours,
            v_schedule.late_withdrawal_penalty_seconds, v_poll_open,
            v_black, v_white
          )
          returning id into v_match_id;
          v_created := v_created + 1;

          -- 0003'teki alan korumasi sistem yazimlarina izin versin
          perform set_config('app.system_operation', '1', true);

          -- Sabit uyeler
          insert into match_entries (match_id, player_id, entry_type, vip_rank)
          select v_match_id, p.id, 'vip', p.vip_rank
            from profiles p
           where p.tier = 'vip' and p.status = 'active';

          -- Sabit aday oyuncular (parayla tutulan kaleci gibi)
          insert into match_entries (match_id, guest_id, entry_type, vip_rank)
          select v_match_id, g.id, 'vip', g.vip_rank
            from guest_players g
           where g.tier = 'vip' and g.is_active;

          -- MVP'nin tek seferlik hakki; zaten yazilmis kisiyi tekrar eklemez
          insert into match_entries (match_id, player_id, guest_id, entry_type, vip_rank)
          select v_match_id, g.player_id, g.guest_id, 'vip', 1
            from vip_grants g
           where g.applied_match_id is null
             and not exists (
               select 1 from match_entries e
                where e.match_id = v_match_id
                  and ((g.player_id is not null and e.player_id = g.player_id)
                    or (g.guest_id  is not null and e.guest_id  = g.guest_id))
             );

          update vip_grants
             set applied_match_id = v_match_id
           where applied_match_id is null;

          perform set_config('app.system_operation', '0', true);
        exception
          -- Baska bir istek ayni maci bizden once yazdi; sorun degil
          when unique_violation then null;
        end;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.ensure_scheduled_matches() from public;
grant execute on function public.ensure_scheduled_matches() to authenticated;

-- Acik ankette katman degisirse mevcut satir da guncellensin diye kullanilir.
create or replace function public.sync_open_poll_tiers()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  perform set_config('app.system_operation', '1', true);

  update match_entries e
     set entry_type = p.tier, vip_rank = p.vip_rank
    from profiles p, matches m
   where e.player_id = p.id
     and m.id = e.match_id
     and m.status = 'poll_open'
     and (e.entry_type is distinct from p.tier or e.vip_rank is distinct from p.vip_rank);
  get diagnostics v_count = row_count;

  update match_entries e
     set entry_type = g.tier, vip_rank = g.vip_rank
    from guest_players g, matches m
   where e.guest_id = g.id
     and m.id = e.match_id
     and m.status = 'poll_open'
     and (e.entry_type is distinct from g.tier or e.vip_rank is distinct from g.vip_rank);

  perform set_config('app.system_operation', '0', true);

  return v_count;
end;
$$;

revoke all on function public.sync_open_poll_tiers() from public;
grant execute on function public.sync_open_poll_tiers() to authenticated;

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0023_email.sql
-- Uyenin e-posta adresi (profiles.email) ve odeme hatirlatmasi bayragi; claim_payment_reminder ile mail bir kez gider.
-- -----------------------------------------------------------------------------

-- Uyenin e-posta adresi ve odeme hatirlatmasi.
--
-- E-posta auth.users'da duruyor ama uygulama o semayi okuyamaz; bu yuzden
-- profiles'a kopyalanir. Giris yapan herkes icin tetikleyici yazar, mevcut
-- kullanicilar icin bir kez geriye donuk doldurulur.
--
-- Hatirlatma: mac saatinden 24 saat sonra odemesi eksik olanlara mail atilir.
-- Iki kez gitmesin diye gonderim ani macin satirina yazilir.

alter table profiles
  add column if not exists email text;

alter table matches
  add column if not exists payment_reminder_sent_at timestamptz;

-- Mevcut kullanicilarin adresleri
update profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

-- Bundan sonra giris yapanlar icin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Adres degisirse profildeki kopya da guncellensin
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Hatirlatmayi yalnizca bir kez gonderebilmek icin: bayragi kapan kazanir.
-- Iki istek ayni anda gelse bile mail bir kez gider.
create or replace function public.claim_payment_reminder(p_match_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_claimed uuid;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  update matches
     set payment_reminder_sent_at = now()
   where id = p_match_id
     and payment_reminder_sent_at is null
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_payment_reminder(uuid) from public;
grant execute on function public.claim_payment_reminder(uuid) to authenticated;

-- Yanlis giden ya da tekrar gonderilmesi gereken hatirlatma icin
create or replace function public.reset_payment_reminder(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  update matches set payment_reminder_sent_at = null where id = p_match_id;
end;
$$;

revoke all on function public.reset_payment_reminder(uuid) from public;
grant execute on function public.reset_payment_reminder(uuid) to authenticated;


