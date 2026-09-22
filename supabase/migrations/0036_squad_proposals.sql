-- Oyuncularin kadro onerileri.
--
-- Takimi yonetici kurar ama herkesin bir fikri vardir: "su ikisi ayni takimda
-- olmaz", "kaleci degissin". Bu fikirler simdiye kadar sahada tartisiliyordu.
-- Artik her oyuncu kendi dagilimini kaydedebilir, herkes birbirininkini
-- gorur, yonetici begendigini tek tiklamayla uygular.
--
-- Kurallar:
--   - Oneri ancak kadro kesinlestikten sonra yapilir; kim oynayacak belli
--     olmadan dagitmanin anlami yok.
--   - Herkesin tek onerisi olur, istedigi kadar guncelleyebilir.
--   - Oneriyi yalnizca sahibi (ya da yonetici) siler.
--   - Uygulamak yalnizca yoneticinin isi.

create table if not exists squad_proposals (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id)  on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, author_id)
);

create index if not exists squad_proposals_match_idx
  on squad_proposals (match_id, created_at);

-- Onerinin satirlari: hangi kadro satiri hangi takimda.
create table if not exists squad_proposal_slots (
  proposal_id  uuid not null references squad_proposals(id) on delete cascade,
  squad_row_id uuid not null references match_squad(id)     on delete cascade,
  team         team_t not null,
  primary key (proposal_id, squad_row_id)
);

alter table squad_proposals      enable row level security;
alter table squad_proposal_slots enable row level security;

do $$
begin
  -- Oneriler grup icine aciktir; kim ne onerdigi gorunur
  create policy squad_proposals_select on squad_proposals for select
    using (is_active_member());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy squad_proposals_delete on squad_proposals for delete
    using (is_admin() or author_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy squad_proposal_slots_select on squad_proposal_slots for select
    using (is_active_member());
exception when duplicate_object then null;
end $$;

-- Yazma islemi asagidaki fonksiyon uzerinden yapilir; dogrudan insert yok.

/**
 * Oneriyi kaydeder ya da gunceller.
 *
 * p_black_ids / p_white_ids match_squad.id degerleridir. Kadronun tamami
 * dagitilmak zorunda: eksik birakilan oyuncu sahada kimin tarafinda oynayacagi
 * belirsiz bir oneri demek olurdu.
 */
create or replace function public.save_squad_proposal(
  p_match_id uuid, p_black_ids uuid[], p_white_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_status   match_status_t;
  v_kickoff  timestamptz;
  v_author   uuid := auth.uid();
  v_proposal uuid;
  v_squad    int;
  v_given    int;
begin
  if not is_active_member() then
    raise exception 'Yetkisiz';
  end if;

  select status, kickoff_at into v_status, v_kickoff from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Maç bulunamadı';
  end if;

  -- Oneri penceresi: kadro kesinlesince acilir, mac saatinde kapanir.
  -- Oynanmis ya da iptal edilmis hafta icin oneri anlamsizdir.
  if v_status <> 'squad_locked' then
    raise exception 'Öneri yalnızca kadro kesinleştikten sonra, maç oynanana kadar yapılabilir';
  end if;

  if v_kickoff < now() then
    raise exception 'Maç saati geçti, öneri kapandı';
  end if;

  select count(*) into v_squad from match_squad where match_id = p_match_id;

  select count(*) into v_given
    from match_squad
   where match_id = p_match_id
     and id = any(coalesce(p_black_ids, '{}') || coalesce(p_white_ids, '{}'));

  if v_given <> v_squad then
    raise exception 'Kadronun tamamını iki takıma dağıtmalısın';
  end if;

  insert into squad_proposals (match_id, author_id)
  values (p_match_id, v_author)
  on conflict (match_id, author_id)
  do update set updated_at = now()
  returning id into v_proposal;

  delete from squad_proposal_slots where proposal_id = v_proposal;

  insert into squad_proposal_slots (proposal_id, squad_row_id, team)
  select v_proposal, ms.id, 'black'::team_t
    from match_squad ms
   where ms.match_id = p_match_id and ms.id = any(coalesce(p_black_ids, '{}'));

  insert into squad_proposal_slots (proposal_id, squad_row_id, team)
  select v_proposal, ms.id, 'white'::team_t
    from match_squad ms
   where ms.match_id = p_match_id and ms.id = any(coalesce(p_white_ids, '{}'));

  return v_proposal;
end;
$$;

revoke all on function public.save_squad_proposal(uuid, uuid[], uuid[]) from public;
grant execute on function public.save_squad_proposal(uuid, uuid[], uuid[]) to authenticated;

/** Yonetici bir oneriyi gercek takim dagilimina cevirir. */
create or replace function public.apply_squad_proposal(p_proposal_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid;
  v_black uuid[];
  v_white uuid[];
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select match_id into v_match from squad_proposals where id = p_proposal_id;
  if v_match is null then
    raise exception 'Öneri bulunamadı';
  end if;

  select array_agg(squad_row_id) filter (where team = 'black'),
         array_agg(squad_row_id) filter (where team = 'white')
    into v_black, v_white
    from squad_proposal_slots
   where proposal_id = p_proposal_id;

  perform public.set_squad_teams(v_match, coalesce(v_black, '{}'), coalesce(v_white, '{}'));
end;
$$;

revoke all on function public.apply_squad_proposal(uuid) from public;
grant execute on function public.apply_squad_proposal(uuid) to authenticated;
