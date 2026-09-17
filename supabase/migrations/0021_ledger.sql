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
