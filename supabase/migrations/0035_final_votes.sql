-- Verilen oy ve yazilan yorum kesindir.
--
-- Simdiye kadar herkes kendi oyunu istedigi kadar degistirebiliyor, kendi
-- yorumunu silebiliyordu. Bu, "son anda fikrini degistirme" kapisini acik
-- birakiyordu: MVP yarisi kizisinca oylar oynayabiliyordu.
--
-- Yeni kural:
--   - Oyuncu bir kisiye bir kez oy verir; degistiremez.
--   - Oyuncu yorumunu silemez.
--   - Yonetici her oyu ve her yorumu degistirebilir ya da silebilir.
--     Sildiginde o kisi yeniden oy verebilir / yorum yazabilir.

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

  if p_ratee_player_id = v_rater then
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

-- Yorumu yalnizca yonetici siler; yazan kendi yorumunu silemez.
drop policy if exists match_comments_delete on match_comments;
create policy match_comments_delete on match_comments for delete
  using (is_admin());

-- Yorum metnini yalnizca yonetici duzeltebilir.
drop policy if exists match_comments_update on match_comments;
create policy match_comments_update on match_comments for update
  using (is_admin()) with check (is_admin());
