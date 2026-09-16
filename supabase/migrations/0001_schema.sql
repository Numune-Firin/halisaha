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
