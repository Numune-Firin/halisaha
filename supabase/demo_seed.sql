-- ORNEK (DEMO) VERI — sayfalari dolu gormek icin.
--
-- Bu dosya gercek bir kurulum parcasi degildir; uygulamanin butun ekranlarini
-- (anket, kadro, takim dagilimi, skor, puan durumu) veri ile gormek icin
-- calistirilir. Urettigi her kayit "Demo Saha" sahasina ve asagidaki aday
-- oyuncu isimlerine baglidir; supabase/demo_cleanup.sql hepsini geri siler.
--
-- Nasil calistirilir: Supabase SQL Editor'e yapistir ve Run.

-- match_entries.entered_at'i elle yazabilmek icin koruma tetikleyicisi
-- gecici olarak sistem islemi moduna alinir (join_poll'un yaptiginin ayni).
select set_config('app.system_operation', '1', false);

do $$
declare
  v_season   uuid;
  v_admin    uuid;
  v_guests   uuid[];
  v_extra    uuid[];
  v_match    uuid;
  v_names    text[] := array[
    'Ahmet Yılmaz','Mehmet Demir','Mustafa Kaya','Ali Çelik',
    'Hüseyin Şahin','İbrahim Yıldız','Osman Aydın','Emre Öztürk',
    'Burak Arslan','Kerem Doğan','Serkan Koç','Tolga Kurt','Onur Şen'
  ];
  v_extra_names text[] := array['Barış Aksoy','Cem Polat','Uğur Taş'];
  v_name     text;
  v_id       uuid;
  v_i        int;
  v_rot      int;
  v_black    int;
  v_white    int;
  v_kickoff  timestamptz;
begin
  -- Iki kez calistirilirsa her sey ikilenir; zaten varsa hicbir sey yapilmaz.
  if exists (select 1 from matches where venue = 'Demo Saha') then
    raise notice 'Demo veri zaten var, tekrar eklenmedi';
    return;
  end if;

  -- 1) Sezon: aktif sezon yoksa bir tane acilir
  select id into v_season from seasons where is_active limit 1;
  if v_season is null then
    insert into seasons (name, starts_on, is_active)
    values ('2026-2027 Sezonu', current_date - 60, true)
    returning id into v_season;
  end if;

  -- 2) Admin: kadrolara kendisi de yazilir ki puan durumunda kendini gorsun
  select id into v_admin from profiles where role = 'admin' order by created_at limit 1;

  -- 3) Aday oyuncular
  v_guests := '{}';
  foreach v_name in array v_names loop
    select id into v_id from guest_players where full_name = v_name;
    if v_id is null then
      insert into guest_players (full_name, position)
      values (v_name, (array['goalkeeper','defender','midfielder','forward']::position_t[])[1 + (length(v_name) % 4)])
      returning id into v_id;
    end if;
    v_guests := v_guests || v_id;
  end loop;

  v_extra := '{}';
  foreach v_name in array v_extra_names loop
    select id into v_id from guest_players where full_name = v_name;
    if v_id is null then
      insert into guest_players (full_name, position)
      values (v_name, 'midfielder')
      returning id into v_id;
    end if;
    v_extra := v_extra || v_id;
  end loop;

  -- Admin yoksa kadroyu 14'e tamamlamak icin bir aday daha kullanilir
  if v_admin is null then
    v_guests := v_guests || v_extra[1];
    v_extra  := v_extra[2:];
  end if;

  -- 4) Oynanmis uc mac: kadro + takim dagilimi + skor
  for v_i in 1..3 loop
    v_kickoff := date_trunc('hour', now()) - make_interval(days => 7 * (4 - v_i)) ;
    v_rot     := v_i * 3;
    v_black   := 2 + v_i;          -- 3, 4, 5
    v_white   := case v_i when 2 then 4 else 2 end;  -- 2, 4, 2

    insert into matches (season_id, kickoff_at, venue, status, squad_size, fee_per_player,
                         black_score, white_score)
    values (v_season, v_kickoff, 'Demo Saha', 'played', 14, 150, v_black, v_white)
    returning id into v_match;

    if v_admin is not null then
      insert into match_squad (match_id, player_id) values (v_match, v_admin);
    end if;
    insert into match_squad (match_id, guest_id) select v_match, unnest(v_guests);

    with ordered as (
      select id, row_number() over (order by coalesce(player_id::text, guest_id::text)) as rn
        from match_squad where match_id = v_match
    )
    update match_squad ms
       set team = case when ((o.rn + v_rot) % 14) < 7 then 'black'::team_t else 'white'::team_t end
      from ordered o
     where ms.id = o.id;

    -- Kadro gercekte anketten dogar; mac sayfasi listeyi girislerden okur
    if v_admin is not null then
      insert into match_entries (match_id, player_id) values (v_match, v_admin);
    end if;
    insert into match_entries (match_id, guest_id) select v_match, unnest(v_guests);

    with ordered as (
      select id, row_number() over (order by coalesce(player_id::text, guest_id::text)) as rn
        from match_entries where match_id = v_match
    )
    update match_entries me
       set entered_at = v_kickoff - interval '7 days' + (o.rn * interval '37 seconds')
      from ordered o
     where me.id = o.id;
  end loop;

  -- 5) Kadrosu kesinlesmis, henuz oynanmamis mac
  insert into matches (season_id, kickoff_at, venue, status, squad_size, fee_per_player)
  values (v_season, date_trunc('hour', now()) + interval '2 days', 'Demo Saha', 'squad_locked', 14, 150)
  returning id into v_match;

  if v_admin is not null then
    insert into match_squad (match_id, player_id) values (v_match, v_admin);
    insert into match_entries (match_id, player_id) values (v_match, v_admin);
  end if;
  insert into match_squad   (match_id, guest_id) select v_match, unnest(v_guests);
  insert into match_entries (match_id, guest_id) select v_match, unnest(v_guests);

  with ordered as (
    select id, row_number() over (order by coalesce(player_id::text, guest_id::text)) as rn
      from match_entries where match_id = v_match
  )
  update match_entries me
     set entered_at = now() - interval '5 days' + (o.rn * interval '37 seconds')
    from ordered o
   where me.id = o.id;

  -- 6) Anketi acik mac: 14 kisilik kadro dolmus, uzerine yedekler yazilmis
  insert into matches (season_id, kickoff_at, venue, status, squad_size, fee_per_player,
                       withdrawal_window_hours, poll_opened_at)
  values (v_season, date_trunc('hour', now()) + interval '5 days', 'Demo Saha', 'poll_open', 14, 150,
          20, now() - interval '2 days')
  returning id into v_match;

  if v_admin is not null then
    insert into match_entries (match_id, player_id) values (v_match, v_admin);
  end if;
  insert into match_entries (match_id, guest_id) select v_match, unnest(v_guests || v_extra);

  -- Giris saatleri: tetikleyici hepsini now() yazar, sirayi gormek icin dagitilir
  with ordered as (
    select id, row_number() over (order by coalesce(player_id::text, guest_id::text)) as rn
      from match_entries where match_id = v_match
  )
  update match_entries me
     set entered_at = now() - interval '2 days' + (o.rn * interval '43 seconds')
    from ordered o
   where me.id = o.id;

  -- Bir VIP ve bir oncelikli giris: uc katmanli siralama gorunur olsun
  update match_entries set entry_type = 'vip', vip_rank = 1
   where match_id = v_match and guest_id = v_guests[3];
  update match_entries set entry_type = 'priority'
   where match_id = v_match and guest_id = v_guests[7];

  -- Gec cikis cezasi ornegi: sonraki ankette sirasi 8 saniye geriye duser
  update match_entries set offset_seconds = 8
   where match_id = v_match and guest_id = v_guests[5];
end;
$$;

select set_config('app.system_operation', '0', false);

select 'Demo veri hazir' as sonuc,
       (select count(*) from matches where venue = 'Demo Saha') as demo_mac_sayisi;
