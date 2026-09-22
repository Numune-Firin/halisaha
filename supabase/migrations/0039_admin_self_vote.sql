-- Yonetici kendine oy verebilir.
--
-- Simdiye kadar tablo kisiti kimsenin kendine oy vermesini engelliyordu.
-- Artik kural oyuncular icin duruyor, yonetici icin kalkiyor: ligi yuruten
-- kisinin kendi katkisini de puanlayabilmesi istendi.
--
-- Kisit tablodan kalkip fonksiyona tasiniyor, cunku "kim oldugu" bilgisi
-- ancak calisma aninda bilinir. Kendine verilen oy gizlenmez: oylama
-- denetiminde ayri bir isaret olarak butun yoneticilere gorunur.

alter table match_ratings drop constraint if exists match_ratings_self_ck;

create or replace function public.rate_player(
  p_match_id uuid, p_ratee_player_id uuid, p_ratee_guest_id uuid, p_stars smallint
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
  v_rater  uuid := auth.uid();
  v_exists boolean;
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

  -- Verilen oy kesindir. Yonetici degistirebilir; oyuncu, ancak yonetici
  -- oyunu sildikten sonra yeniden verebilir.
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
    insert into match_ratings (match_id, rater_id, ratee_player_id, stars)
    values (p_match_id, v_rater, p_ratee_player_id, p_stars)
    on conflict (match_id, rater_id, ratee_player_id) where ratee_player_id is not null
    do update set stars = excluded.stars, updated_at = now();
  else
    insert into match_ratings (match_id, rater_id, ratee_guest_id, stars)
    values (p_match_id, v_rater, p_ratee_guest_id, p_stars)
    on conflict (match_id, rater_id, ratee_guest_id) where ratee_guest_id is not null
    do update set stars = excluded.stars, updated_at = now();
  end if;
end;
$$;

revoke all on function public.rate_player(uuid, uuid, uuid, smallint) from public;
grant execute on function public.rate_player(uuid, uuid, uuid, smallint) to authenticated;
