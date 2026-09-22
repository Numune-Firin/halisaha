-- Sistem sahibinin oy agirligi ve elle MVP secimi.
--
-- Iki sey ekleniyor:
--
--   1) Oy agirligi. Bir oy normalde bir sayilir. Sistem sahibi kendi verdigi
--      oyun kac oy sayilacagini belirleyebilir (1-20). Ortalamalar ve MVP
--      hesabi artik agirlikli calisir; agirligi bir olan herkes icin sonuc
--      degismez.
--
--   2) Elle MVP. Yonetici macin yildizini dogrudan secebilir. Secildikten
--      sonra oylama biterken otomatik hesap devreye girmez, cunku
--      finalize_due_mvps yalnizca MVP'si bos maclara bakar.
--
-- Not: agirlik, kim kime ne verdi listesinde gosterilmez; ekranlar yildizi
-- yazar. Bu bilincli bir tercih, istenirse gosterilebilir.

alter table match_ratings
  add column if not exists weight int not null default 1;

do $$
begin
  alter table match_ratings
    add constraint match_ratings_weight_ck check (weight between 1 and 20);
exception when duplicate_object then null;
end $$;

-- Oy verme: agirligi yalnizca sistem sahibi degistirebilir.
create or replace function public.rate_player(
  p_match_id uuid,
  p_ratee_player_id uuid,
  p_ratee_guest_id uuid,
  p_stars smallint,
  p_weight int default 1
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
  v_rater  uuid := auth.uid();
  v_exists boolean;
  v_weight int := 1;
begin
  if not is_active_member() then
    raise exception 'Yetkisiz';
  end if;

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Yıldız 1 ile 5 arasında olmalı';
  end if;

  if num_nonnulls(p_ratee_player_id, p_ratee_guest_id) <> 1 then
    raise exception 'Oy verilen kişi belirsiz';
  end if;

  -- Kendine oy yalnizca yoneticiye acik
  if p_ratee_player_id = v_rater and not public.is_admin() then
    raise exception 'Kendine oy veremezsin';
  end if;

  -- Agirlik sistem sahibine ozeldir; digerlerinde her oy bir sayilir
  if public.is_system_owner() and p_weight between 1 and 20 then
    v_weight := p_weight;
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Maç bulunamadı';
  end if;

  if v_status not in ('played', 'completed') then
    raise exception 'Oylama maç oynandı olarak işaretlenince açılır';
  end if;

  if not public.is_admin()
     and not exists (
       select 1 from match_squad
        where match_id = p_match_id and player_id = v_rater
     ) then
    raise exception 'Bu maçın kadrosunda değilsin';
  end if;

  if not exists (
    select 1 from match_squad
     where match_id = p_match_id
       and ((p_ratee_player_id is not null and player_id = p_ratee_player_id)
         or (p_ratee_guest_id  is not null and guest_id  = p_ratee_guest_id))
  ) then
    raise exception 'Oy verilen kişi bu maçın kadrosunda değil';
  end if;

  select exists (
    select 1 from match_ratings
     where match_id = p_match_id
       and rater_id = v_rater
       and ((p_ratee_player_id is not null and ratee_player_id = p_ratee_player_id)
         or (p_ratee_guest_id  is not null and ratee_guest_id  = p_ratee_guest_id))
  ) into v_exists;

  if v_exists and not public.is_admin() then
    raise exception 'Oyunu verdin, değiştiremezsin. Yönetici silerse yeniden verebilirsin.';
  end if;

  if p_ratee_player_id is not null then
    insert into match_ratings (match_id, rater_id, ratee_player_id, stars, weight)
    values (p_match_id, v_rater, p_ratee_player_id, p_stars, v_weight)
    on conflict (match_id, rater_id, ratee_player_id) where ratee_player_id is not null
    do update set stars = excluded.stars, weight = excluded.weight, updated_at = now();
  else
    insert into match_ratings (match_id, rater_id, ratee_guest_id, stars, weight)
    values (p_match_id, v_rater, p_ratee_guest_id, p_stars, v_weight)
    on conflict (match_id, rater_id, ratee_guest_id) where ratee_guest_id is not null
    do update set stars = excluded.stars, weight = excluded.weight, updated_at = now();
  end if;
end;
$$;

revoke all on function public.rate_player(uuid, uuid, uuid, smallint, int) from public;
grant execute on function public.rate_player(uuid, uuid, uuid, smallint, int) to authenticated;

-- Genel yildiz ozeti agirlikli hesaplanir.
create or replace function public.rating_summary()
returns table (participant_id uuid, is_guest boolean, average numeric, votes int)
language sql security definer set search_path = public as $$
  select coalesce(ratee_player_id, ratee_guest_id)              as participant_id,
         ratee_player_id is null                                as is_guest,
         round((sum(stars * weight)::numeric / sum(weight)), 1) as average,
         sum(weight)::int                                       as votes
    from match_ratings
   where is_active_member()
   group by 1, 2;
$$;

revoke all on function public.rating_summary() from public;
grant execute on function public.rating_summary() to authenticated;

-- MVP hesabi da agirlikli; esitlikte oy toplami, o da esitse ad sirasi.
create or replace function public.finalize_due_mvps()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_match  record;
  v_best   record;
  v_count  int := 0;
begin
  if not (is_active_member() or is_system_caller()) then
    return 0;
  end if;

  for v_match in
    select id from matches
     where status in ('played', 'completed')
       and voting_closes_at is not null
       and voting_closes_at <= now()
       and mvp_player_id is null
       and mvp_guest_id is null
  loop
    select r.ratee_player_id, r.ratee_guest_id,
           sum(r.stars * r.weight)::numeric / sum(r.weight) as average,
           sum(r.weight) as votes
      into v_best
      from match_ratings r
     where r.match_id = v_match.id
     group by r.ratee_player_id, r.ratee_guest_id
     order by sum(r.stars * r.weight)::numeric / sum(r.weight) desc, sum(r.weight) desc
     limit 1;

    if not found then
      continue;
    end if;

    update matches
       set mvp_player_id = v_best.ratee_player_id,
           mvp_guest_id  = v_best.ratee_guest_id
     where id = v_match.id;

    insert into vip_grants (player_id, guest_id, source_match_id)
    values (v_best.ratee_player_id, v_best.ratee_guest_id, v_match.id)
    on conflict (source_match_id) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.finalize_due_mvps() from public;
grant execute on function public.finalize_due_mvps() to authenticated, service_role;

/**
 * Macin yildizini elle secer ya da secimi kaldirir.
 *
 * Secildikten sonra otomatik hesap devreye girmez: finalize_due_mvps yalnizca
 * MVP'si bos maclara bakar. Secimi kaldirmak icin iki parametre de null verilir;
 * o zaman oylama bitiminde hesap yeniden calisir.
 */
create or replace function public.set_match_mvp(
  p_match_id uuid, p_player_id uuid, p_guest_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if num_nonnulls(p_player_id, p_guest_id) > 1 then
    raise exception 'Aynı anda iki kişi seçilemez';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Maç bulunamadı';
  end if;

  if v_status not in ('played', 'completed') then
    raise exception 'Maçın yıldızı ancak maç oynandıktan sonra seçilir';
  end if;

  if p_player_id is not null and not exists (
    select 1 from match_squad where match_id = p_match_id and player_id = p_player_id
  ) then
    raise exception 'Seçilen kişi bu maçın kadrosunda değil';
  end if;

  if p_guest_id is not null and not exists (
    select 1 from match_squad where match_id = p_match_id and guest_id = p_guest_id
  ) then
    raise exception 'Seçilen kişi bu maçın kadrosunda değil';
  end if;

  update matches
     set mvp_player_id = p_player_id,
         mvp_guest_id  = p_guest_id
   where id = p_match_id;

  -- MVP'nin sonraki ankette VIP olma hakki; secim degisirse eski hak kalkar
  delete from vip_grants where source_match_id = p_match_id;

  if num_nonnulls(p_player_id, p_guest_id) = 1 then
    insert into vip_grants (player_id, guest_id, source_match_id)
    values (p_player_id, p_guest_id, p_match_id)
    on conflict (source_match_id) do nothing;
  end if;
end;
$$;

revoke all on function public.set_match_mvp(uuid, uuid, uuid) from public;
grant execute on function public.set_match_mvp(uuid, uuid, uuid) to authenticated;
