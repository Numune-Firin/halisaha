-- Zamanlanmis gorevlerin (cron) veritabanina erisimi.
--
-- Takvim uretimi ve MVP hesabi bugune kadar yalnizca bir uye uygulamayi
-- acinca calisiyordu: ikisi de is_active_member() bekliyor, cron'un ise
-- oturumu yok. Bu yuzden kimse girmezse hafta acilmiyor, MVP secilmiyordu.
--
-- Cozum: service_role anahtariyla gelen cagriyi da gecerli sayiyoruz.
-- service_role zaten RLS'i atlar; buradaki fark, bu iki fonksiyonun
-- gerektirdigi "uye" kosulunu sistem cagrisinin da saglamasi.

create or replace function public.is_system_caller()
returns boolean
language sql stable set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

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
  -- Anonim ya da onay bekleyen kullanicilar takvimi tetikleyemez.
  -- Zamanlanmis gorev (service_role) kimse giris yapmadan da tetikleyebilir.
  if not (is_active_member() or is_system_caller()) then
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
      v_date := v_today + v_delta + v_week * 7;

      -- Takvimin gecerli oldugu araligin disindaki haftalar atlanir
      if v_schedule.starts_on is not null and v_date < v_schedule.starts_on then
        continue;
      end if;
      if v_schedule.ends_on is not null and v_date > v_schedule.ends_on then
        exit;
      end if;

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

          -- Sabit ve oncelikli uyeler, kendi saniyeleriyle
          insert into match_entries (match_id, player_id, entry_type, vip_rank, entered_at)
          select v_match_id, p.id, p.tier, p.vip_rank,
                 v_poll_open + make_interval(secs => p.auto_entry_seconds)
            from profiles p
           where p.tier in ('vip', 'priority') and p.status = 'active';

          -- Sabit ve oncelikli aday oyuncular (parayla tutulan kaleci gibi)
          insert into match_entries (match_id, guest_id, entry_type, vip_rank, entered_at)
          select v_match_id, g.id, g.tier, g.vip_rank,
                 v_poll_open + make_interval(secs => g.auto_entry_seconds)
            from guest_players g
           where g.tier in ('vip', 'priority') and g.is_active;

          -- MVP'nin tek seferlik hakki; zaten yazilmis kisiyi tekrar eklemez
          insert into match_entries (match_id, player_id, guest_id, entry_type, vip_rank, entered_at)
          select v_match_id, g.player_id, g.guest_id, 'vip', 1, v_poll_open
            from vip_grants g
           where g.applied_match_id is null
             and not exists (
               select 1 from match_entries e
                where e.match_id = v_match_id
                  and ((g.player_id is not null and e.player_id = g.player_id)
                    or (g.guest_id  is not null and e.guest_id  = g.guest_id))
             );

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

revoke all on function public.ensure_scheduled_matches() from public;
grant execute on function public.ensure_scheduled_matches() to authenticated, service_role;

revoke all on function public.finalize_due_mvps() from public;
grant execute on function public.finalize_due_mvps() to authenticated, service_role;
