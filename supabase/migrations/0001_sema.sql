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
