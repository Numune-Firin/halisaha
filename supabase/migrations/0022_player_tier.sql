-- Sabit (VIP) ve oncelikli oyuncu tanimi.
--
-- Siralama bastan beri uc katmanli: VIP -> oncelikli -> normal. Bugune kadar
-- katman yalnizca anket satirinda (match_entries.entry_type) duruyordu ve
-- hicbir yerden yazilmiyordu. Artik katman kisinin kendisinde durur; anket
-- satirlari bu tanimdan dogar.
--
-- VIP ayrica "sabit oyuncu" demektir: anket acildigi anda listeye kendiliginden
-- yazilir, girmesine gerek kalmaz. Sirasi vip_rank ile belirlenir (kucuk olan
-- once), bos ise VIP'ler kendi aralarinda yazilma sirasina gore dizilir.

alter table profiles
  add column if not exists tier     entry_type_t not null default 'standard',
  add column if not exists vip_rank int;

alter table guest_players
  add column if not exists tier     entry_type_t not null default 'standard',
  add column if not exists vip_rank int;

-- Ankete kendi giren uyenin katmani profilinden gelir.
create or replace function public.join_poll(
  p_match_id uuid, p_player_id uuid, p_offset int, p_consumed_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_offset int;
  v_tier   entry_type_t;
  v_rank   int;
begin
  if not exists (
    select 1 from matches where id = p_match_id and status = 'poll_open'
  ) then
    raise exception 'Anket kapali';
  end if;

  select tier, vip_rank into v_tier, v_rank from profiles where id = p_player_id;
  v_tier := coalesce(v_tier, 'standard');

  perform set_config('app.system_operation', '1', true);

  -- Katman her girise yeniden yazilir: admin birini VIP yaptiginda acik
  -- ankette de gecerli olsun.
  insert into match_entries (match_id, player_id, entry_type, vip_rank, offset_seconds)
  values (p_match_id, p_player_id, v_tier, v_rank, p_offset)
  on conflict (match_id, player_id) where player_id is not null do update
     set withdrawn_at       = null,
         is_late_withdrawal = false,
         entered_at         = now(),
         entry_type         = excluded.entry_type,
         vip_rank           = excluded.vip_rank;

  if array_length(p_consumed_ids, 1) is not null then
    update adjustments
       set applied_match_id = p_match_id
     where id = any(p_consumed_ids)
       and player_id = p_player_id
       and applied_match_id is null;
  end if;

  select coalesce(sum(seconds), 0) into v_offset
    from adjustments
   where player_id = p_player_id and applied_match_id = p_match_id;

  update match_entries
     set offset_seconds = v_offset
   where match_id = p_match_id and player_id = p_player_id;

  perform set_config('app.system_operation', '0', true);
end;
$$;

revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from public;
revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from authenticated;
grant execute on function public.join_poll(uuid, uuid, int, uuid[]) to service_role;

-- Admin'in elle ekledigi kisi de kendi katmaniyla girer.
create or replace function public.admin_add_entry(
  p_match_id uuid, p_player_id uuid, p_guest_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tier entry_type_t;
  v_rank int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if num_nonnulls(p_player_id, p_guest_id) <> 1 then
    raise exception 'Bir uye ya da bir aday oyuncu secilmeli';
  end if;

  if not exists (select 1 from matches where id = p_match_id and status = 'poll_open') then
    raise exception 'Anket kapali';
  end if;

  if p_player_id is not null then
    select tier, vip_rank into v_tier, v_rank from profiles where id = p_player_id;
    v_tier := coalesce(v_tier, 'standard');

    insert into match_entries (match_id, player_id, entry_type, vip_rank)
    values (p_match_id, p_player_id, v_tier, v_rank)
    on conflict (match_id, player_id) where player_id is not null
    do update set withdrawn_at = null, is_late_withdrawal = false, entered_at = now(),
                  entry_type = excluded.entry_type, vip_rank = excluded.vip_rank;
  else
    select tier, vip_rank into v_tier, v_rank from guest_players where id = p_guest_id;
    v_tier := coalesce(v_tier, 'standard');

    insert into match_entries (match_id, guest_id, entry_type, vip_rank)
    values (p_match_id, p_guest_id, v_tier, v_rank)
    on conflict (match_id, guest_id) where guest_id is not null
    do update set withdrawn_at = null, is_late_withdrawal = false, entered_at = now(),
                  entry_type = excluded.entry_type, vip_rank = excluded.vip_rank;
  end if;
end;
$$;

revoke all on function public.admin_add_entry(uuid, uuid, uuid) from public;
grant execute on function public.admin_add_entry(uuid, uuid, uuid) to authenticated;

-- Anket acilir acilmaz sabit oyuncular listeye yazilir. MVP'nin tek seferlik
-- VIP hakki da ayni anda islenir.
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

-- Acik ankette katman degisirse mevcut satir da guncellensin diye kullanilir.
create or replace function public.sync_open_poll_tiers()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  perform set_config('app.system_operation', '1', true);

  update match_entries e
     set entry_type = p.tier, vip_rank = p.vip_rank
    from profiles p, matches m
   where e.player_id = p.id
     and m.id = e.match_id
     and m.status = 'poll_open'
     and (e.entry_type is distinct from p.tier or e.vip_rank is distinct from p.vip_rank);
  get diagnostics v_count = row_count;

  update match_entries e
     set entry_type = g.tier, vip_rank = g.vip_rank
    from guest_players g, matches m
   where e.guest_id = g.id
     and m.id = e.match_id
     and m.status = 'poll_open'
     and (e.entry_type is distinct from g.tier or e.vip_rank is distinct from g.vip_rank);

  perform set_config('app.system_operation', '0', true);

  return v_count;
end;
$$;

revoke all on function public.sync_open_poll_tiers() from public;
grant execute on function public.sync_open_poll_tiers() to authenticated;
