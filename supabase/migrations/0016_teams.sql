-- Takim tanimi.
--
-- Takim adlari artik her takvimde/macta elle yazilmaz; ayri bir tabloda tanimli
-- dururlar. Ayni anda yalnizca iki takim aktiftir: active_slot = 1 ve 2. Kadro
-- dagitimi bu iki takima yapilir.
--
-- Slot, ic isleyisteki 'black'/'white' karsiligidir: 1 = black, 2 = white.
-- Boylece eski maclar, puan durumu ve skor kolonlari oldugu gibi calismaya
-- devam eder; degisen yalnizca ekranda gorunen ad.

create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 24),
  active_slot smallint check (active_slot in (1, 2)),
  created_at  timestamptz not null default now()
);

-- Bir slotta ayni anda tek takim durabilir
create unique index if not exists teams_active_slot_uniq
  on teams (active_slot) where active_slot is not null;
create unique index if not exists teams_name_uniq
  on teams (lower(btrim(name)));

alter table teams enable row level security;

do $$
begin
  create policy teams_select on teams for select using (is_active_member());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy teams_all on teams for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

-- Ilk kurulumda bugune kadar kullanilan iki ad hazir gelir
insert into teams (name, active_slot)
select * from (values ('Siyah', 1::smallint), ('Beyaz', 2::smallint)) as v(name, active_slot)
 where not exists (select 1 from teams);

-- Takimi bir slota alir ya da (p_slot null ise) pasife ceker. Slot dolu ise
-- oradaki takim once bosaltilir; tek islemde oldugu icin tekillik bozulmaz.
create or replace function public.set_team_slot(p_team_id uuid, p_slot smallint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if p_slot is not null and p_slot not in (1, 2) then
    raise exception 'Takim sirasi 1 ya da 2 olmali';
  end if;

  if not exists (select 1 from teams where id = p_team_id) then
    raise exception 'Takim bulunamadi';
  end if;

  if p_slot is null then
    update teams set active_slot = null where id = p_team_id;
    return;
  end if;

  update teams set active_slot = null
   where active_slot = p_slot and id <> p_team_id;

  update teams set active_slot = p_slot where id = p_team_id;
end;
$$;

revoke all on function public.set_team_slot(uuid, smallint) from public;
grant execute on function public.set_team_slot(uuid, smallint) to authenticated;

-- Takvimdeki ad kolonlari artik gereksiz: kaynak tek yerde, teams tablosunda.
alter table match_schedules
  drop column if exists black_team_name,
  drop column if exists white_team_name;

-- Yeni mac dogarken o an aktif olan iki takimin adi kopyalanir.
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
          );
          v_created := v_created + 1;
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
