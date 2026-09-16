-- Haftalik tekrar eden anket takvimi.
--
-- Amac: "her Pazartesi 12:00" gibi tek bir tanim yapildiginda maclarin ve
-- anketlerin kendiliginden acilmasi. Takvim bilerek SEZONA BAGLI DEGILDIR:
-- sezon bittiginde ya da yeni sezon acildiginda tanim yerinde kalir ve
-- uretilen maclar o an aktif olan sezona baglanir. Boylece yeni sezonun ilk
-- macinda yeniden tanim yapmak gerekmez.
create table match_schedules (
  id                              uuid primary key default gen_random_uuid(),
  -- ISO haftagunu: 1 = Pazartesi ... 7 = Pazar
  weekday                         int not null check (weekday between 1 and 7),
  start_time                      time not null,
  venue                           text not null default '',
  squad_size                      int not null default 14 check (squad_size between 2 and 40),
  fee_per_player                  numeric(10,2) not null default 0 check (fee_per_player >= 0),
  withdrawal_window_hours         int not null default 20 check (withdrawal_window_hours >= 0),
  late_withdrawal_penalty_seconds int not null default 8 check (late_withdrawal_penalty_seconds >= 0),
  -- Anket, mac saatine bu kadar gun kala acilir
  open_days_before                int not null default 7 check (open_days_before between 0 and 60),
  is_active                       boolean not null default true,
  created_at                      timestamptz not null default now()
);

-- Hangi macin hangi takvimden dogdugu izlenebilsin
alter table matches add column schedule_id uuid references match_schedules(id) on delete set null;

-- Es zamanli iki uretim ayni maci iki kez yazamaz
create unique index matches_schedule_kickoff_uniq
  on matches (schedule_id, kickoff_at)
  where schedule_id is not null;

alter table match_schedules enable row level security;

-- seasons/matches ile ayni kural: aktif uyeler okur, admin yazar
create policy match_schedules_select on match_schedules for select using (is_active_member());
create policy match_schedules_all    on match_schedules for all    using (is_admin()) with check (is_admin());

-- Vakti gelmis takvim maclarini olusturur ve olusturulan sayiyi dondurur.
--
-- Idempotenttir: ayni an icin mac zaten varsa hicbir sey yapmaz, bu yuzden
-- her sayfa acilisinda cagrilabilir. Boylece ayri bir zamanlanmis gorev
-- (cron) kurmadan, uygulamayi kullanan ilk kisi yeni haftanin anketini acmis
-- olur. Istenirse pg_cron ile gunde bir kez de cagrilabilir.
--
-- security definer: anketi acma yetkisi adminde oldugu icin siradan bir uyenin
-- sayfa acmasi normalde mac yazamaz. Fonksiyon kullanici girdisi almaz, yalnizca
-- match_schedules satirlarini uygular; disaridan gelen tek sey cagirma anidir.
create or replace function public.ensure_scheduled_matches()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_schedule record;
  v_today    date;
  v_delta    int;
  v_date     date;
  v_kickoff  timestamptz;
  v_season   uuid;
  v_week     int;
  v_created  int := 0;
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

    -- open_days_before en fazla 60 gun oldugu icin 10 hafta her durumu kapsar
    for v_week in 0..9 loop
      v_date    := v_today + v_delta + v_week * 7;
      v_kickoff := (v_date + v_schedule.start_time) at time zone 'Europe/Istanbul';

      -- Bu hafta cok uzaksa sonrakiler daha da uzaktir
      exit when v_kickoff > now() + make_interval(days => v_schedule.open_days_before);

      if v_kickoff > now()
         and not exists (select 1 from matches where kickoff_at = v_kickoff)
      then
        begin
          insert into matches (
            season_id, schedule_id, kickoff_at, venue, squad_size, fee_per_player,
            withdrawal_window_hours, late_withdrawal_penalty_seconds
          ) values (
            v_season, v_schedule.id, v_kickoff, v_schedule.venue, v_schedule.squad_size,
            v_schedule.fee_per_player, v_schedule.withdrawal_window_hours,
            v_schedule.late_withdrawal_penalty_seconds
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
