-- Saha uzerinde diziliş: kim hangi takimda ve sahanin neresinde duruyor.
--
-- Takim dagitimi simdiye kadar iki listeydi: "Siyah" ve "Beyaz". Kimin kalede,
-- kimin onde oynayacagi listede gorunmuyordu. Artik oyuncular saha uzerine
-- surukleniyor; konum da kaydediliyor, boylece dizilişi acan herkes ayni
-- goruntuyu goruyor.
--
-- Konum saha genisliginin/yuksekliginin yuzdesidir (0-100). Ust yari bir
-- takim, alt yari digeri; takim bilgisi yine ayri kolonda durur, cunku puan
-- durumu ve skor ona bakar.

alter table match_squad
  add column if not exists pos_x numeric(5,2),
  add column if not exists pos_y numeric(5,2);

alter table squad_proposal_slots
  add column if not exists pos_x numeric(5,2),
  add column if not exists pos_y numeric(5,2);

/**
 * Takim dagilimini ve saha konumlarini tek islemde yazar.
 *
 * p_rows bicimi: [{"id": "<match_squad.id>", "team": "black", "x": 50, "y": 20}, ...]
 * Listede olmayan oyuncu takimsiz kalir (sahaya konmamis demektir).
 */
create or replace function public.set_squad_lineup(p_match_id uuid, p_rows jsonb)
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
    raise exception 'Maç bulunamadı';
  end if;

  if v_status = 'poll_open' then
    raise exception 'Önce kadroyu kesinleştir';
  end if;

  update match_squad
     set team = null, pos_x = null, pos_y = null
   where match_id = p_match_id;

  update match_squad ms
     set team  = (r->>'team')::team_t,
         pos_x = nullif(r->>'x', '')::numeric,
         pos_y = nullif(r->>'y', '')::numeric
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
   where ms.match_id = p_match_id
     and ms.id = (r->>'id')::uuid
     and (r->>'team') in ('black', 'white');
end;
$$;

revoke all on function public.set_squad_lineup(uuid, jsonb) from public;
grant execute on function public.set_squad_lineup(uuid, jsonb) to authenticated;

-- Oneri de artik konumlari tasiyor; eski imza kullanilmiyor.
drop function if exists public.save_squad_proposal(uuid, uuid[], uuid[]);

/**
 * Oyuncunun kendi dizilişini kaydeder ya da gunceller.
 * p_rows bicimi set_squad_lineup ile ayni.
 */
create or replace function public.save_squad_proposal(p_match_id uuid, p_rows jsonb)
returns uuid
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

  -- Oneri penceresi: kadro kesinlesince acilir, mac saatinde kapanir
  if v_status <> 'squad_locked' then
    raise exception 'Öneri yalnızca kadro kesinleştikten sonra, maç oynanana kadar yapılabilir';
  end if;

  if v_kickoff < now() then
    raise exception 'Maç saati geçti, öneri kapandı';
  end if;

  select count(*) into v_squad from match_squad where match_id = p_match_id;

  select count(*) into v_given
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    join match_squad ms
      on ms.id = (r->>'id')::uuid and ms.match_id = p_match_id
   where (r->>'team') in ('black', 'white');

  if v_given <> v_squad then
    raise exception 'Kadronun tamamını sahaya yerleştirmelisin';
  end if;

  insert into squad_proposals (match_id, author_id)
  values (p_match_id, v_author)
  on conflict (match_id, author_id)
  do update set updated_at = now()
  returning id into v_proposal;

  delete from squad_proposal_slots where proposal_id = v_proposal;

  insert into squad_proposal_slots (proposal_id, squad_row_id, team, pos_x, pos_y)
  select v_proposal,
         ms.id,
         (r->>'team')::team_t,
         nullif(r->>'x', '')::numeric,
         nullif(r->>'y', '')::numeric
    from jsonb_array_elements(p_rows) r
    join match_squad ms
      on ms.id = (r->>'id')::uuid and ms.match_id = p_match_id
   where (r->>'team') in ('black', 'white');

  return v_proposal;
end;
$$;

revoke all on function public.save_squad_proposal(uuid, jsonb) from public;
grant execute on function public.save_squad_proposal(uuid, jsonb) to authenticated;

/** Yonetici bir oneriyi gercek dizilişe cevirir; konumlar da gecer. */
create or replace function public.apply_squad_proposal(p_proposal_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid;
  v_rows  jsonb;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select match_id into v_match from squad_proposals where id = p_proposal_id;
  if v_match is null then
    raise exception 'Öneri bulunamadı';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'id',   squad_row_id,
             'team', team,
             'x',    pos_x,
             'y',    pos_y
           )
         )
    into v_rows
    from squad_proposal_slots
   where proposal_id = p_proposal_id;

  perform public.set_squad_lineup(v_match, coalesce(v_rows, '[]'::jsonb));
end;
$$;

revoke all on function public.apply_squad_proposal(uuid) from public;
grant execute on function public.apply_squad_proposal(uuid) to authenticated;
