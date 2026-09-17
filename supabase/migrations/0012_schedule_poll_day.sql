-- Anket gunu ile mac gunu ayrilir.
--
-- Onceki model anketi "mactan N gun once" aciyordu; bu, anket saatini zorunlu
-- olarak mac saatine esitliyordu. Gercekte ikisi bagimsiz: mac Persembe 22:15
-- oynanirken anket Pazartesi 12:00'de aciliyor. Gun sayisi yerine anketin kendi
-- haftagunu ve saati tutulur.
--
-- Anket ani, mactan onceki EN YAKIN (anket gunu + anket saati) anidir. Boylece
-- tanim her hafta kendiliginden dogru cift uretir.

alter table match_schedules
  add column if not exists poll_weekday   int  not null default 1 check (poll_weekday between 1 and 7),
  add column if not exists poll_open_time time not null default '12:00';

-- Eski tanimlar birebir korunur: mactan N gun onceki ayni saat.
update match_schedules
   set poll_weekday   = ((weekday - 1 - open_days_before) % 7 + 7) % 7 + 1,
       poll_open_time = start_time
 where open_days_before is not null;

alter table match_schedules drop column if exists open_days_before;

-- Mac satirina anketin acildigi an da yazilir; cekilme suresi ve listedeki
-- "anket ne zaman acildi" bilgisi buna bakar.
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
            withdrawal_window_hours, late_withdrawal_penalty_seconds, poll_opened_at
          ) values (
            v_season, v_schedule.id, v_kickoff, v_schedule.venue, v_schedule.squad_size,
            v_schedule.fee_per_player, v_schedule.withdrawal_window_hours,
            v_schedule.late_withdrawal_penalty_seconds, v_poll_open
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
