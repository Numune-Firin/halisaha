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
