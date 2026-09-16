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
create type mevki_t      as enum ('kaleci','defans','orta_saha','forvet');
create type rol_t        as enum ('admin','oyuncu');
create type uye_durum_t  as enum ('onay_bekliyor','aktif','pasif');
create type mac_durum_t  as enum ('anket_acik','kadro_kesin','oynandi','tamamlandi');
create type giris_tipi_t as enum ('vip','oncelikli','normal');

-- Uyeler
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  ad         text not null default '',
  mevki      mevki_t,
  rol        rol_t not null default 'oyuncu',
  durum      uye_durum_t not null default 'onay_bekliyor',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Sezonlar
create table seasons (
  id         uuid primary key default gen_random_uuid(),
  ad         text not null,
  baslangic  date not null,
  bitis      date,
  aktif      boolean not null default true,
  created_at timestamptz not null default now()
);
-- Ayni anda yalnizca bir aktif sezon olabilir
create unique index seasons_tek_aktif on seasons (aktif) where aktif;

-- Maclar
create table matches (
  id                  uuid primary key default gen_random_uuid(),
  sezon_id            uuid references seasons(id) on delete set null,
  mac_zamani          timestamptz not null,
  saha                text not null default '',
  durum               mac_durum_t not null default 'anket_acik',
  kadro_boyutu        int not null default 14 check (kadro_boyutu between 2 and 40),
  kisi_basi_ucret     numeric(10,2) not null default 0 check (kisi_basi_ucret >= 0),
  cikis_penceresi_saat int not null default 20 check (cikis_penceresi_saat >= 0),
  gec_cikis_cezasi_sn int not null default 8 check (gec_cikis_cezasi_sn >= 0),
  anket_acilis        timestamptz not null default now(),
  son_odeme_gunu      date,
  siyah_skor          int check (siyah_skor >= 0),
  beyaz_skor          int check (beyaz_skor >= 0),
  created_at          timestamptz not null default now()
);

-- Ankete giris kayitlari (VIP dahil)
create table match_entries (
  id            uuid primary key default gen_random_uuid(),
  mac_id        uuid not null references matches(id) on delete cascade,
  oyuncu_id     uuid not null references profiles(id) on delete cascade,
  tip           giris_tipi_t not null default 'normal',
  giris_zamani  timestamptz not null default now(),
  ofset_sn      int not null default 0,
  vip_sira      int,
  cikis_zamani  timestamptz,
  gec_cikis     boolean not null default false,
  unique (mac_id, oyuncu_id)
);
create index match_entries_mac_idx on match_entries (mac_id);

-- Giris zamani her zaman sunucu saatiyle yazilir; istemciden gelen deger yok sayilir
create or replace function match_entries_giris_zamani_zorla()
returns trigger language plpgsql as $$
begin
  new.giris_zamani := now();
  return new;
end;
$$;

create trigger match_entries_giris_zamani_trg
  before insert on match_entries
  for each row execute function match_entries_giris_zamani_zorla();

-- Ceza / odul kayitlari. saniye > 0 ceza, < 0 odul
create table adjustments (
  id                  uuid primary key default gen_random_uuid(),
  oyuncu_id           uuid not null references profiles(id) on delete cascade,
  saniye              int not null check (saniye <> 0),
  sebep               text not null default '',
  kaynak_mac_id       uuid references matches(id) on delete set null,
  kullanildigi_mac_id uuid references matches(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index adjustments_bekleyen_idx
  on adjustments (oyuncu_id) where kullanildigi_mac_id is null;

-- Varsayilan ayarlar (tek satir)
create table settings (
  id                   boolean primary key default true check (id),
  kadro_boyutu         int not null default 14,
  kisi_basi_ucret      numeric(10,2) not null default 0,
  cikis_penceresi_saat int not null default 20,
  gec_cikis_cezasi_sn  int not null default 8
);
insert into settings default values;


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0002_rls.sql
-- Satir Seviyesi Guvenlik (RLS) politikalarini acar: kim hangi satiri okuyabilir/yazabilir kurallarini tanimlar.
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0003_ofset_koruma.sql
-- Kullanicilarin kendi ceza/odul (ofset) degerlerini degistirmesini engelleyen ek koruma kurali.
-- -----------------------------------------------------------------------------

-- Oyuncu kendi anket satirini guncellerken yalnizca cikis_zamani alanini degistirebilir.
-- Admin (service_role veya rol='admin') bu kisitin disindadir.
create or replace function match_entries_oyuncu_korumasi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sistem RPC'leri (ankete_gir, anketten_cik) islem basinda app.sistem_islemi
  -- bayragini set eder ve bu kisittan muaf tutulur. Bayrak islem sonunda duser.
  if public.is_admin()
     or coalesce(current_setting('app.sistem_islemi', true), '0') = '1' then
    return new;
  end if;

  if new.tip <> old.tip
     or new.ofset_sn <> old.ofset_sn
     or new.vip_sira is distinct from old.vip_sira
     or new.giris_zamani <> old.giris_zamani
     or new.oyuncu_id <> old.oyuncu_id
     or new.mac_id <> old.mac_id then
    raise exception 'Bu alanlari yalnizca yonetici degistirebilir';
  end if;

  return new;
end;
$$;

create trigger match_entries_oyuncu_korumasi_trg
  before update on match_entries
  for each row execute function match_entries_oyuncu_korumasi();


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0004_rpc.sql
-- Ankete giris/cikis islemlerini tek ve guvenli bir islemde yapan RPC (sunucu) fonksiyonlarini tanimlar.
-- -----------------------------------------------------------------------------

-- Eski imzalar (brief'in ilk halinde ankete_gir(uuid, int) idi) once dusuruluyor.
-- create or replace yalnizca ayni imzali fonksiyonun govdesini degistirir; farkli
-- imzali eski bir surum varsa PUBLIC calistirma yetkisiyle yerinde kalir ve
-- asagidaki revoke/grant satirlari onu hedeflemez. Once temizle, sonra yarat.
drop function if exists public.ankete_gir(uuid, int);
drop function if exists public.anketten_cik(uuid, uuid, boolean, int);

-- Ankete giris. Ilk giris ve cikip tekrar girme ayni yoldan gecer.
-- Tekrar giriste giris zamani sifirlanir (yeni sira), tip korunur:
-- oncelikli oyuncu tekrar girdiginde yine oncelikli katmaninda kalir.
-- Ofset yazimi ile ceza kayitlarinin tuketilmesi tek islemde gerceklesir.
-- Yalnizca service_role cagirabilir; kimlik dogrulamasi uygulama katmanindadir.
create or replace function public.ankete_gir(
  p_mac_id uuid, p_oyuncu_id uuid, p_ofset int, p_tuketilecek uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from matches where id = p_mac_id and durum = 'anket_acik'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.sistem_islemi', '1', true);

  insert into match_entries (mac_id, oyuncu_id, tip, ofset_sn)
  values (p_mac_id, p_oyuncu_id, 'normal', p_ofset)
  on conflict (mac_id, oyuncu_id) do update
     set cikis_zamani = null,
         gec_cikis    = false,
         giris_zamani = now(),
         ofset_sn     = match_entries.ofset_sn + p_ofset;

  if array_length(p_tuketilecek, 1) is not null then
    update adjustments
       set kullanildigi_mac_id = p_mac_id
     where id = any(p_tuketilecek)
       and oyuncu_id = p_oyuncu_id
       and kullanildigi_mac_id is null;
  end if;

  -- Bayrak islem kapsamli (set_config'in ucuncu parametresi true = local).
  -- Yine de acikca sifirlanir: bu fonksiyon ileride baska bir plpgsql
  -- fonksiyonundan cagrilirsa, cagiranin geri kalani ayni islemde 0003'teki
  -- alan korumasindan sessizce muaf kalmasin.
  perform set_config('app.sistem_islemi', '0', true);
end;
$$;

-- Cikis ve gec cikis cezasini tek islemde yazar.
-- Yalnizca service_role cagirabilir.
create or replace function public.anketten_cik(
  p_mac_id uuid, p_oyuncu_id uuid, p_gec_cikis boolean, p_ceza_sn int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not exists (
    select 1 from matches where id = p_mac_id and durum = 'anket_acik'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.sistem_islemi', '1', true);

  update match_entries
     set cikis_zamani = now(), gec_cikis = p_gec_cikis
   where mac_id = p_mac_id and oyuncu_id = p_oyuncu_id and cikis_zamani is null;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ankette acik kayit yok';
  end if;

  if p_gec_cikis and p_ceza_sn > 0 then
    insert into adjustments (oyuncu_id, saniye, sebep, kaynak_mac_id)
    values (p_oyuncu_id, p_ceza_sn, 'Geç çıkış', p_mac_id);
  end if;

  perform set_config('app.sistem_islemi', '0', true);
end;
$$;

revoke all on function public.ankete_gir(uuid, uuid, int, uuid[]) from public;
revoke all on function public.ankete_gir(uuid, uuid, int, uuid[]) from authenticated;
revoke all on function public.anketten_cik(uuid, uuid, boolean, int) from public;
revoke all on function public.anketten_cik(uuid, uuid, boolean, int) from authenticated;
grant execute on function public.ankete_gir(uuid, uuid, int, uuid[]) to service_role;
grant execute on function public.anketten_cik(uuid, uuid, boolean, int) to service_role;


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0005_match_squad.sql
-- Kesinlesen kadroyu (siyah/beyaz takim atamasi) saklayan match_squad tablosunu ve RLS politikalarini olusturur.
-- -----------------------------------------------------------------------------

create type takim_t as enum ('siyah','beyaz');

create table match_squad (
  id        uuid primary key default gen_random_uuid(),
  mac_id    uuid not null references matches(id) on delete cascade,
  oyuncu_id uuid not null references profiles(id) on delete cascade,
  takim     takim_t,
  unique (mac_id, oyuncu_id)
);
create index match_squad_mac_idx on match_squad (mac_id);

alter table match_squad enable row level security;
create policy match_squad_select on match_squad for select using (is_aktif_uye());
create policy match_squad_all    on match_squad for all    using (is_admin()) with check (is_admin());


-- -----------------------------------------------------------------------------
-- KAYNAK: supabase/migrations/0006_kadro_kesinlestir.sql
-- Admin'in kadroyu kesinlestirmesini saglayan fonksiyonu tanimlar.
-- -----------------------------------------------------------------------------

-- Kesin kadroyu tek islemde yazar: eski kadroyu siler, yenisini ekler,
-- maci kadro_kesin durumuna gecirir. Ucu birden basarili olur ya da hicbiri olmaz.
-- Yetki kontrolu fonksiyonun icinde; authenticated role acik olmasi guvenli.
create or replace function public.kadroyu_kesinlestir(
  p_mac_id uuid, p_oyuncular uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if not exists (select 1 from matches where id = p_mac_id) then
    raise exception 'Mac bulunamadi';
  end if;

  delete from match_squad where mac_id = p_mac_id;

  if array_length(p_oyuncular, 1) is not null then
    insert into match_squad (mac_id, oyuncu_id)
    select p_mac_id, unnest(p_oyuncular);
  end if;

  update matches set durum = 'kadro_kesin' where id = p_mac_id;
end;
$$;

revoke all on function public.kadroyu_kesinlestir(uuid, uuid[]) from public;
grant execute on function public.kadroyu_kesinlestir(uuid, uuid[]) to authenticated;


