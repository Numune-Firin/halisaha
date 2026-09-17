-- Oylama bitisi, MVP ve MVP'nin bir sonraki ankette VIP hakki.
--
-- 1) Yonetici kendine de oy verebilir; sinir yalnizca normal oyuncuya kalir.
-- 2) Her oyuncunun bir "genel yildiz"i vardir: butun maclardan gelen ortalama.
--    Yonetici bu ortalamayi elle ezebilir (override_rating).
-- 3) Mac oynandi olarak isaretlenince oylama icin bir bitis ani yazilir.
--    Sure dolunca o macin MVP'si oylardan hesaplanir.
-- 4) MVP, bir sonraki anket acildigi anda VIP olarak listeye yazilir.

-- 1) Kendine oy verme sinirini tablo seviyesinden al; karar rate_player'da
alter table match_ratings drop constraint if exists match_ratings_self_ck;

-- 2) Elle yazilan genel yildiz. Bos ise ortalama gecerlidir.
alter table profiles      add column if not exists override_rating numeric(2,1);
alter table guest_players add column if not exists override_rating numeric(2,1);

do $$
begin
  alter table profiles add constraint profiles_override_rating_ck
    check (override_rating is null or override_rating between 1 and 5);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table guest_players add constraint guest_players_override_rating_ck
    check (override_rating is null or override_rating between 1 and 5);
exception when duplicate_object then null;
end $$;

-- 3) Oylama penceresi ve MVP
alter table matches
  add column if not exists voting_closes_at timestamptz,
  add column if not exists mvp_player_id uuid references profiles(id) on delete set null,
  add column if not exists mvp_guest_id  uuid references guest_players(id) on delete set null;

do $$
begin
  alter table matches add constraint matches_mvp_ck
    check (num_nonnulls(mvp_player_id, mvp_guest_id) <= 1);
exception when duplicate_object then null;
end $$;

alter table settings
  add column if not exists voting_window_hours int not null default 48;

do $$
begin
  alter table settings add constraint settings_voting_window_ck
    check (voting_window_hours between 1 and 720);
exception when duplicate_object then null;
end $$;

-- Mac oynandi olunca oylama suresi kendiliginden baslar. Hangi yoldan
-- gecildigi onemli degil (skor girilmesi de mark_match_played de ayni yere
-- ciktigi icin karar tetikleyicide toplanir).
create or replace function public.tg_start_voting_window()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'played'
     and old.status is distinct from 'played'
     and new.voting_closes_at is null then
    new.voting_closes_at := now()
      + make_interval(hours => coalesce((select voting_window_hours from settings where id), 48));
  end if;
  return new;
end;
$$;

drop trigger if exists matches_voting_window on matches;
create trigger matches_voting_window
  before update of status on matches
  for each row
  execute function public.tg_start_voting_window();

-- Bitis anini yonetici elle de degistirebilir.
create or replace function public.set_voting_deadline(
  p_match_id uuid, p_closes_at timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if not exists (select 1 from matches where id = p_match_id) then
    raise exception 'Mac bulunamadi';
  end if;

  update matches set voting_closes_at = p_closes_at where id = p_match_id;
end;
$$;

revoke all on function public.set_voting_deadline(uuid, timestamptz) from public;
grant execute on function public.set_voting_deadline(uuid, timestamptz) to authenticated;

-- 4) MVP'nin bir sonraki ankette kullanacagi VIP hakki
create table if not exists vip_grants (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid references profiles(id) on delete cascade,
  guest_id         uuid references guest_players(id) on delete cascade,
  source_match_id  uuid not null references matches(id) on delete cascade,
  applied_match_id uuid references matches(id) on delete set null,
  reason           text not null default 'MVP',
  created_at       timestamptz not null default now(),
  constraint vip_grants_participant_ck check (num_nonnulls(player_id, guest_id) = 1)
);

-- Bir macin MVP'si icin tek hak uretilir
create unique index if not exists vip_grants_source_uniq on vip_grants (source_match_id);

alter table vip_grants enable row level security;

do $$
begin
  create policy vip_grants_select on vip_grants for select using (is_active_member());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy vip_grants_all on vip_grants for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

-- Oy verme kurallari yeniden: yonetici kendine de verebilir, sure dolunca
-- kimse veremez.
create or replace function public.rate_player(
  p_match_id uuid, p_ratee_player_id uuid, p_ratee_guest_id uuid, p_stars smallint
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match  record;
  v_rater  uuid := auth.uid();
  v_admin  boolean := public.is_admin();
begin
  if not is_active_member() then
    raise exception 'Yetkisiz';
  end if;

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Yildiz 1 ile 5 arasinda olmali';
  end if;

  if num_nonnulls(p_ratee_player_id, p_ratee_guest_id) <> 1 then
    raise exception 'Oy verilen kisi belirsiz';
  end if;

  -- Kendine oy verme yalnizca yoneticiye acik
  if p_ratee_player_id = v_rater and not v_admin then
    raise exception 'Kendine oy veremezsin';
  end if;

  select status, voting_closes_at into v_match from matches where id = p_match_id;
  if v_match is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_match.status not in ('played', 'completed') then
    raise exception 'Oylama mac oynandi olarak isaretlenince acilir';
  end if;

  if v_match.voting_closes_at is not null and v_match.voting_closes_at <= now() then
    raise exception 'Oylama suresi doldu';
  end if;

  if not v_admin
     and not exists (
       select 1 from match_squad
        where match_id = p_match_id and player_id = v_rater
     ) then
    raise exception 'Bu macin kadrosunda degilsin';
  end if;

  if not exists (
    select 1 from match_squad
     where match_id = p_match_id
       and ((p_ratee_player_id is not null and player_id = p_ratee_player_id)
         or (p_ratee_guest_id  is not null and guest_id  = p_ratee_guest_id))
  ) then
    raise exception 'Oy verilen kisi bu macin kadrosunda degil';
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

-- Yorumlar da bitis aninda kapanir; kural RLS'te durur ki dogrudan istek de
-- ayni sinira takilsin.
drop policy if exists match_comments_insert on match_comments;
create policy match_comments_insert on match_comments for insert
  with check (
    is_active_member()
    and author_id = auth.uid()
    and exists (
      select 1 from matches m
       where m.id = match_id
         and (m.voting_closes_at is null or m.voting_closes_at > now())
    )
  );

-- Suresi dolmus maclarin MVP'sini hesaplar. En yuksek ortalama kazanir;
-- esitlikte daha cok oy alan, o da esitse ada gore ilk gelen.
-- Her cagrida yalnizca MVP'si belirlenmemis maclara bakar.
create or replace function public.finalize_due_mvps()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_match  record;
  v_best   record;
  v_count  int := 0;
begin
  if not is_active_member() then
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
           avg(r.stars) as average, count(*) as votes
      into v_best
      from match_ratings r
     where r.match_id = v_match.id
     group by r.ratee_player_id, r.ratee_guest_id
     order by avg(r.stars) desc, count(*) desc
     limit 1;

    -- Hic oy verilmemisse MVP yok; kayit dokunulmadan kalir, oy gelirse
    -- sonraki cagrida yeniden bakilir.
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
grant execute on function public.finalize_due_mvps() to authenticated;

-- Genel yildiz ozeti. match_ratings satirlarini kimse goremez (RLS), ama
-- ortalama herkese aciktir: bu fonksiyon yalnizca toplami dondurur, kimin
-- ne verdigini sizdirmaz.
create or replace function public.rating_summary()
returns table (participant_id uuid, is_guest boolean, average numeric, votes int)
language sql security definer set search_path = public as $$
  select coalesce(ratee_player_id, ratee_guest_id) as participant_id,
         ratee_player_id is null                   as is_guest,
         round(avg(stars)::numeric, 1)             as average,
         count(*)::int                             as votes
    from match_ratings
   where is_active_member()
   group by 1, 2;
$$;

revoke all on function public.rating_summary() from public;
grant execute on function public.rating_summary() to authenticated;

-- Yeni mac dogarken bekleyen VIP haklari listeye yazilir: MVP, anket acilir
-- acilmaz kadroda olur.
create or replace function public.ensure_scheduled_matches()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_schedule   record;
  v_today      date;
  v_delta      int;
  v_date       date;
  v_kickoff    timestamptz;
  v_poll_back  int;
  v_poll_open  timestamptz;
  v_season     uuid;
  v_week       int;
  v_created    int := 0;
  v_black      text;
  v_white      text;
  v_match_id   uuid;
begin
  -- Anonim ya da onay bekleyen kullanicilar takvimi tetikleyemez
  if not is_active_member() then
    return 0;
  end if;

  select id into v_season from seasons where is_active limit 1;

  select name into v_black from teams where active_slot = 1;
  select name into v_white from teams where active_slot = 2;
  v_black := coalesce(v_black, 'Siyah');
  v_white := coalesce(v_white, 'Beyaz');

  -- Gun donumu Turkiye saatine gore hesaplanir; sunucu UTC calisir
  v_today := (now() at time zone 'Europe/Istanbul')::date;

  for v_schedule in select * from match_schedules where is_active loop
    -- Bu haftanin ilgili gunune kac gun var (bugunse 0)
    v_delta := (v_schedule.weekday - extract(isodow from v_today)::int + 7) % 7;

    for v_week in 0..9 loop
      v_date    := v_today + v_delta + v_week * 7;
      v_kickoff := (v_date + v_schedule.start_time) at time zone 'Europe/Istanbul';

      -- Mac gununden geriye giderek anket gunune inilir
      v_poll_back := (extract(isodow from v_date)::int - v_schedule.poll_weekday + 7) % 7;
      v_poll_open := ((v_date - v_poll_back) + v_schedule.poll_open_time)
                     at time zone 'Europe/Istanbul';
      -- Ayni gune denk gelip mactan sonraya dusuyorsa bir onceki haftadir
      if v_poll_open >= v_kickoff then
        v_poll_open := v_poll_open - interval '7 days';
      end if;

      -- Bu haftanin anketi henuz acilmadiysa sonrakiler daha da ileridedir
      exit when v_poll_open > now();

      if v_kickoff > now()
         and not exists (select 1 from matches where kickoff_at = v_kickoff)
      then
        begin
          insert into matches (
            season_id, schedule_id, kickoff_at, venue, squad_size, fee_per_player,
            withdrawal_window_hours, late_withdrawal_penalty_seconds, poll_opened_at,
            black_team_name, white_team_name
          ) values (
            v_season, v_schedule.id, v_kickoff, v_schedule.venue, v_schedule.squad_size,
            v_schedule.fee_per_player, v_schedule.withdrawal_window_hours,
            v_schedule.late_withdrawal_penalty_seconds, v_poll_open,
            v_black, v_white
          )
          returning id into v_match_id;
          v_created := v_created + 1;

          -- 0003'teki alan korumasi sistem yazimlarina izin versin
          perform set_config('app.system_operation', '1', true);

          insert into match_entries (match_id, player_id, guest_id, entry_type, vip_rank)
          select v_match_id, g.player_id, g.guest_id, 'vip', 1
            from vip_grants g
           where g.applied_match_id is null;

          update vip_grants
             set applied_match_id = v_match_id
           where applied_match_id is null;

          perform set_config('app.system_operation', '0', true);
        exception
          -- Baska bir istek ayni maci bizden once yazdi; sorun degil
          when unique_violation then null;
        end;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.ensure_scheduled_matches() from public;
grant execute on function public.ensure_scheduled_matches() to authenticated;
