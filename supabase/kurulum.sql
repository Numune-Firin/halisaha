-- =============================================================================
-- HALI SAHA - TEK PARCA VERITABANI KURULUM DOSYASI
-- =============================================================================
--
-- Bu dosya, supabase/migrations/ klasorundeki dokuz migration dosyasinin
-- (0001'den 0009'a) sirayla ve degistirilmeden birlestirilmis halidir.
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
-- KAYNAK: supabase/migrations/0006_lock_squad.sql
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

-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0007_realtime.sql
-- Anket girislerinin canli yayinlanmasi icin Realtime aboneligini acar.
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
-- Haftalik tekrar eden anket takvimi: bir kez tanimlanan gun/saat icin maclari kendiliginden acar.
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
-- Uye olmayan aday oyuncular, kadro dolmadan kilitlememe, kilidi geri alma ve ankete elle kisi ekleme.
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
