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
