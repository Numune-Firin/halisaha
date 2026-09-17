-- Iptal edilmis haftaya kadro/skor yazilamaz.
--
-- 0011 ile gelen 'cancelled' durumu, 0009 ve 0010'daki kontrolleri asiyordu:
-- lock_squad yalnizca 'played'/'completed' durumunu reddediyor, set_squad_teams
-- ve set_match_result ise yalnizca 'poll_open' durumunu reddediyordu. Bu
-- fonksiyonlar sayfada iptal edilmis hafta icin gosterilmiyor ama dogrudan
-- adres yazilarak cagrilabilirler; kural veritabaninda da durmali.

create or replace function public.lock_squad(
  p_match_id uuid, p_player_ids uuid[], p_guest_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_squad_size int;
  v_status     match_status_t;
  v_selected   int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select squad_size, status into v_squad_size, v_status from matches where id = p_match_id;
  if v_squad_size is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis haftanin kadrosu kesinlestirilemez';
  end if;

  if v_status in ('played', 'completed') then
    raise exception 'Oynanmis macin kadrosu degistirilemez';
  end if;

  v_selected := coalesce(array_length(p_player_ids, 1), 0)
              + coalesce(array_length(p_guest_ids, 1), 0);

  if v_selected <> v_squad_size then
    raise exception 'Kadro % kisi olmali, su an % kisi secili', v_squad_size, v_selected;
  end if;

  delete from match_squad where match_id = p_match_id;

  if array_length(p_player_ids, 1) is not null then
    insert into match_squad (match_id, player_id)
    select p_match_id, unnest(p_player_ids);
  end if;

  if array_length(p_guest_ids, 1) is not null then
    insert into match_squad (match_id, guest_id)
    select p_match_id, unnest(p_guest_ids);
  end if;

  update matches set status = 'squad_locked' where id = p_match_id;
end;
$$;

revoke all on function public.lock_squad(uuid, uuid[], uuid[]) from public;
grant execute on function public.lock_squad(uuid, uuid[], uuid[]) to authenticated;

create or replace function public.set_squad_teams(
  p_match_id uuid, p_black_ids uuid[], p_white_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta icin takim dagilimi yazilamaz';
  end if;

  if v_status = 'poll_open' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  update match_squad set team = null where match_id = p_match_id;

  if array_length(p_black_ids, 1) is not null then
    update match_squad set team = 'black'
     where match_id = p_match_id and id = any(p_black_ids);
  end if;

  if array_length(p_white_ids, 1) is not null then
    update match_squad set team = 'white'
     where match_id = p_match_id and id = any(p_white_ids);
  end if;
end;
$$;

revoke all on function public.set_squad_teams(uuid, uuid[], uuid[]) from public;
grant execute on function public.set_squad_teams(uuid, uuid[], uuid[]) to authenticated;

create or replace function public.set_match_result(
  p_match_id uuid, p_black_score int, p_white_score int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if p_black_score is null or p_white_score is null then
    raise exception 'Iki takimin da skoru girilmeli';
  end if;

  if p_black_score < 0 or p_white_score < 0 then
    raise exception 'Skor negatif olamaz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta icin skor girilemez';
  end if;

  if v_status = 'poll_open' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  if not exists (select 1 from match_squad where match_id = p_match_id and team = 'black')
     or not exists (select 1 from match_squad where match_id = p_match_id and team = 'white') then
    raise exception 'Once oyunculari iki takima dagit';
  end if;

  update matches
     set black_score = p_black_score,
         white_score = p_white_score,
         status      = 'played'
   where id = p_match_id;
end;
$$;

revoke all on function public.set_match_result(uuid, int, int) from public;
grant execute on function public.set_match_result(uuid, int, int) to authenticated;
