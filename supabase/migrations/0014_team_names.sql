-- Takim adlari artik sabit degil.
--
-- Ic isleyis 'black'/'white' enum'uyla devam eder: puan durumu, skor kolonlari
-- ve eski kayitlar buna bagli. Degisen yalnizca ekranda gorunen ad. Ad hem
-- takvimde (her hafta tekrar yazmamak icin) hem macin kendi satirinda tutulur;
-- boylece adi sonradan degistirsen bile gecmis maclar oynandiklari adla kalir.

alter table match_schedules
  add column if not exists black_team_name text not null default 'Siyah',
  add column if not exists white_team_name text not null default 'Beyaz';

alter table matches
  add column if not exists black_team_name text not null default 'Siyah',
  add column if not exists white_team_name text not null default 'Beyaz';

do $$
begin
  alter table match_schedules
    add constraint match_schedules_team_names_len
    check (length(black_team_name) between 1 and 24
       and length(white_team_name) between 1 and 24);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table matches
    add constraint matches_team_names_len
    check (length(black_team_name) between 1 and 24
       and length(white_team_name) between 1 and 24);
exception when duplicate_object then null;
end $$;

-- Yeni mac dogarken takvimdeki adlar kopyalanir.
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
begin
  -- Anonim ya da onay bekleyen kullanicilar takvimi tetikleyemez
  if not is_active_member() then
    return 0;
  end if;

  select id into v_season from seasons where is_active limit 1;

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
            v_schedule.black_team_name, v_schedule.white_team_name
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

-- Tek bir macin takim adlarini degistirir. Bos birakilan ad varsayilana doner,
-- boylece admin adi silerek eski haline donebilir.
create or replace function public.set_team_names(
  p_match_id uuid, p_black_name text, p_white_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
  v_black  text := nullif(btrim(coalesce(p_black_name, '')), '');
  v_white  text := nullif(btrim(coalesce(p_white_name, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta icin takim adi degistirilemez';
  end if;

  update matches
     set black_team_name = left(coalesce(v_black, 'Siyah'), 24),
         white_team_name = left(coalesce(v_white, 'Beyaz'), 24)
   where id = p_match_id;
end;
$$;

revoke all on function public.set_team_names(uuid, text, text) from public;
grant execute on function public.set_team_names(uuid, text, text) to authenticated;
