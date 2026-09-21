-- Anket saati gelmeden giris yapilamaz.
--
-- Takvimden dogan maclarda sorun yoktu: mac zaten anket saati gelince
-- yaratiliyor. Ama elle acilan tek maclik anketlerde (ara mac) poll_opened_at
-- ileri bir tarihe konabiliyor ve o ana kadar kimse giremiyor olmali.
--
-- Kural burada, veritabaninda duruyor: arayuz dugmeyi gizlese bile adresi
-- bilen biri erken giremez.

create or replace function public.join_poll(
  p_match_id uuid, p_player_id uuid, p_offset int, p_consumed_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_offset int;
  v_tier   entry_type_t;
  v_rank   int;
  v_opens  timestamptz;
begin
  select poll_opened_at into v_opens
    from matches
   where id = p_match_id and status = 'poll_open';

  if v_opens is null then
    raise exception 'Anket kapali';
  end if;

  if v_opens > now() then
    raise exception 'Anket henuz acilmadi';
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

-- Yonetici de erken ekleyemez: anket saatini one almak istiyorsa macin
-- kendi bilgilerinden anket acilis anini degistirir.
create or replace function public.admin_add_entry(
  p_match_id uuid, p_player_id uuid, p_guest_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tier  entry_type_t;
  v_rank  int;
  v_opens timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if num_nonnulls(p_player_id, p_guest_id) <> 1 then
    raise exception 'Bir uye ya da bir aday oyuncu secilmeli';
  end if;

  select poll_opened_at into v_opens
    from matches
   where id = p_match_id and status = 'poll_open';

  if v_opens is null then
    raise exception 'Anket kapali';
  end if;

  if v_opens > now() then
    raise exception 'Anket henuz acilmadi';
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

-- Sabit oyuncular da anket acilmadan listeye yazilmaz.
create or replace function public.apply_standing_entries(p_match_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_opens timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select poll_opened_at into v_opens
    from matches
   where id = p_match_id and status = 'poll_open';

  if v_opens is null then
    raise exception 'Anket kapali';
  end if;

  if v_opens > now() then
    raise exception 'Anket henuz acilmadi';
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
