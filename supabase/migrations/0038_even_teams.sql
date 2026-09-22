-- Takimlar denk olmali.
--
-- Sahaya on dort kisi cikiyorsa yedi-yedi olmali; sekiz-alti bir mac degil,
-- yanlis girilmis bir kayittir. Tek sayili kadroda (on uc kisi) esitlik
-- mumkun olmadigi icin bir kisilik fark kabul edilir.
--
-- Ayni kural ekranda da var: kaydet dugmesi fark ikiden buyukse calismaz.
-- Buradaki kontrol o ekran atlanirsa diye.

create or replace function public.set_squad_lineup(p_match_id uuid, p_rows jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
  v_black  int;
  v_white  int;
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

  select count(*) filter (where r->>'team' = 'black'),
         count(*) filter (where r->>'team' = 'white')
    into v_black, v_white
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;

  -- Sahada kimse yoksa dagitim sifirlaniyor demektir; buna izin verilir
  if (v_black + v_white) > 0 and abs(v_black - v_white) > 1 then
    raise exception 'Takımlar denk değil: % ve %. Aradaki fark en fazla bir kişi olabilir.',
      v_black, v_white;
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
  v_black    int;
  v_white    int;
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

  select count(*) filter (where r->>'team' = 'black'),
         count(*) filter (where r->>'team' = 'white')
    into v_black, v_white
    from jsonb_array_elements(p_rows) r;

  if abs(v_black - v_white) > 1 then
    raise exception 'Takımlar denk değil: % ve %. Aradaki fark en fazla bir kişi olabilir.',
      v_black, v_white;
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
