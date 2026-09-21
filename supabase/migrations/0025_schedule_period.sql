-- Takvimin ne zamandan ne zamana kadar isleyecegi.
--
-- Anket takvimi bugune kadar suresizdi: acik kaldigi surece her hafta mac
-- uretiyordu. Artik bir baslangic ve bitis tarihi verilebilir; sezon bitince
-- takvimi durdurmayi unutmak diye bir sey kalmaz.
--
-- Ikisi de bos birakilabilir: baslangic bossa hemen basliyor demektir,
-- bitis bossa el ile duraklatilana kadar devam eder.

alter table match_schedules
  add column if not exists starts_on date,
  add column if not exists ends_on   date;

do $$
begin
  alter table match_schedules add constraint match_schedules_period_ck
    check (starts_on is null or ends_on is null or ends_on >= starts_on);
exception when duplicate_object then null;
end $$;

-- Mac uretimi tarih araligina bakar. Geri kalan davranis 0022'deki ile ayni:
-- takvimden mac dogar, o an sahadaki iki takimin adi kopyalanir, sabit (VIP)
-- oyuncular ve MVP'nin tek seferlik hakki listeye yazilir.
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

          -- Sabit uyeler
          insert into match_entries (match_id, player_id, entry_type, vip_rank)
          select v_match_id, p.id, 'vip', p.vip_rank
            from profiles p
           where p.tier = 'vip' and p.status = 'active';

          -- Sabit aday oyuncular (parayla tutulan kaleci gibi)
          insert into match_entries (match_id, guest_id, entry_type, vip_rank)
          select v_match_id, g.id, 'vip', g.vip_rank
            from guest_players g
           where g.tier = 'vip' and g.is_active;

          -- MVP'nin tek seferlik hakki; zaten yazilmis kisiyi tekrar eklemez
          insert into match_entries (match_id, player_id, guest_id, entry_type, vip_rank)
          select v_match_id, g.player_id, g.guest_id, 'vip', 1
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

revoke all on function public.ensure_scheduled_matches() from public;
grant execute on function public.ensure_scheduled_matches() to authenticated;

-- Takvim disinda acilan tek maclik anket (ara mac) icin: sabit oyuncular ve
-- MVP hakki burada da islensin. Mac elle acildiginda cagrilir.
create or replace function public.apply_standing_entries(p_match_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if not exists (select 1 from matches where id = p_match_id and status = 'poll_open') then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.system_operation', '1', true);

  insert into match_entries (match_id, player_id, entry_type, vip_rank)
  select p_match_id, p.id, 'vip', p.vip_rank
    from profiles p
   where p.tier = 'vip' and p.status = 'active'
     and not exists (
       select 1 from match_entries e
        where e.match_id = p_match_id and e.player_id = p.id
     );
  get diagnostics v_count = row_count;

  insert into match_entries (match_id, guest_id, entry_type, vip_rank)
  select p_match_id, g.id, 'vip', g.vip_rank
    from guest_players g
   where g.tier = 'vip' and g.is_active
     and not exists (
       select 1 from match_entries e
        where e.match_id = p_match_id and e.guest_id = g.id
     );

  insert into match_entries (match_id, player_id, guest_id, entry_type, vip_rank)
  select p_match_id, v.player_id, v.guest_id, 'vip', 1
    from vip_grants v
   where v.applied_match_id is null
     and not exists (
       select 1 from match_entries e
        where e.match_id = p_match_id
          and ((v.player_id is not null and e.player_id = v.player_id)
            or (v.guest_id  is not null and e.guest_id  = v.guest_id))
     );

  update vip_grants set applied_match_id = p_match_id where applied_match_id is null;

  perform set_config('app.system_operation', '0', true);

  return v_count;
end;
$$;

revoke all on function public.apply_standing_entries(uuid) from public;
grant execute on function public.apply_standing_entries(uuid) to authenticated;
