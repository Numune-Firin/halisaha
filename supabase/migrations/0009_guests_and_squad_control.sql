-- Aday oyuncular, kadro kilidinin geri alinmasi ve ankete elle kisi ekleme.
--
-- 1) Aday oyuncu: gruba uye olmayan, Google hesabiyla girmeyen ama maca gelen
--    kisi. auth.users kaydi olmadigi icin profiles'a yazilamaz, ayri tabloda
--    tutulur. Ankette ve kadroda uyelerle ayni satirlarda yer alir.
-- 2) Kadro ancak kontenjan dolunca kesinlestirilebilir.
-- 3) Kesinlesmis kadro admin tarafindan geri alinabilir.
create table guest_players (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null check (length(btrim(full_name)) > 0),
  position   position_t,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table guest_players enable row level security;
create policy guest_players_select on guest_players for select using (is_active_member());
create policy guest_players_all    on guest_players for all    using (is_admin()) with check (is_admin());

-- Anket ve kadro satirlari artik ya bir uyeye ya da bir aday oyuncuya aittir.
-- num_nonnulls = 1 ikisinin ayni anda dolu ya da ikisinin birden bos olmasini engeller.
alter table match_entries
  alter column player_id drop not null,
  add column guest_id uuid references guest_players(id) on delete cascade,
  add constraint match_entries_participant_ck check (num_nonnulls(player_id, guest_id) = 1);

-- (match_id, player_id) tekilligi, player_id null olabildigi icin kismi indekse cevrilir
alter table match_entries drop constraint match_entries_match_id_player_id_key;
create unique index match_entries_player_uniq on match_entries (match_id, player_id) where player_id is not null;
create unique index match_entries_guest_uniq  on match_entries (match_id, guest_id)  where guest_id  is not null;

alter table match_squad
  alter column player_id drop not null,
  add column guest_id uuid references guest_players(id) on delete cascade,
  add constraint match_squad_participant_ck check (num_nonnulls(player_id, guest_id) = 1);

alter table match_squad drop constraint match_squad_match_id_player_id_key;
create unique index match_squad_player_uniq on match_squad (match_id, player_id) where player_id is not null;
create unique index match_squad_guest_uniq  on match_squad (match_id, guest_id)  where guest_id  is not null;

-- Kesin kadroyu tek islemde yazar: eski kadroyu siler, yenisini ekler, maci
-- kadrosu kesinlesmis duruma gecirir. Ucu birden basarili olur ya da hicbiri olmaz.
--
-- 0006'daki surumun uzerine iki degisiklik: aday oyuncular da kadroya yazilabilir
-- ve secilen kisi sayisi kontenjana esit degilse kilitleme reddedilir. Sayi
-- kontrolu burada, veritabaninda yapilir; arayuzdeki kontrol yalnizca kolaylik.
drop function if exists public.lock_squad(uuid, uuid[]);

create or replace function public.lock_squad(
  p_match_id uuid, p_player_ids uuid[], p_guest_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_squad_size int;
  v_status     match_status_t;
  v_selected   int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select squad_size, status into v_squad_size, v_status from matches where id = p_match_id;
  if v_squad_size is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status in ('played', 'completed') then
    raise exception 'Oynanmis macin kadrosu degistirilemez';
  end if;

  v_selected := coalesce(array_length(p_player_ids, 1), 0)
              + coalesce(array_length(p_guest_ids, 1), 0);

  if v_selected <> v_squad_size then
    raise exception 'Kadro % kisi olmali, su an % kisi secili', v_squad_size, v_selected;
  end if;

  delete from match_squad where match_id = p_match_id;

  if array_length(p_player_ids, 1) is not null then
    insert into match_squad (match_id, player_id)
    select p_match_id, unnest(p_player_ids);
  end if;

  if array_length(p_guest_ids, 1) is not null then
    insert into match_squad (match_id, guest_id)
    select p_match_id, unnest(p_guest_ids);
  end if;

  update matches set status = 'squad_locked' where id = p_match_id;
end;
$$;

revoke all on function public.lock_squad(uuid, uuid[], uuid[]) from public;
grant execute on function public.lock_squad(uuid, uuid[], uuid[]) to authenticated;

-- Kesinlesmis kadroyu geri alir: kadro satirlari silinir, anket yeniden acilir.
-- Oynanmis/tamamlanmis maclarda calismaz; puan ve odeme kayitlari o asamada
-- kadroya dayandigi icin geri alma yalnizca kilit asamasinda anlamlidir.
create or replace function public.unlock_squad(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status <> 'squad_locked' then
    raise exception 'Yalnizca kadrosu kesinlesmis mac geri alinabilir';
  end if;

  delete from match_squad where match_id = p_match_id;
  update matches set status = 'poll_open' where id = p_match_id;
end;
$$;

revoke all on function public.unlock_squad(uuid) from public;
grant execute on function public.unlock_squad(uuid) to authenticated;

-- Admin bir uyeyi ya da aday oyuncuyu ankete elle ekler.
--
-- Giris zamani her zaman simdiki andir: elle eklenen kisi sirada en sona,
-- kendi giren herkesin arkasina yazilir. Daha once cikmis bir kayit varsa
-- yeniden acilir. Ofsete (ceza/odul) dokunulmaz; elle ekleme bir ceza
-- tuketimi degildir.
create or replace function public.admin_add_entry(
  p_match_id uuid, p_player_id uuid, p_guest_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
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
    insert into match_entries (match_id, player_id)
    values (p_match_id, p_player_id)
    on conflict (match_id, player_id) where player_id is not null
    do update set withdrawn_at = null, is_late_withdrawal = false, entered_at = now();
  else
    insert into match_entries (match_id, guest_id)
    values (p_match_id, p_guest_id)
    on conflict (match_id, guest_id) where guest_id is not null
    do update set withdrawn_at = null, is_late_withdrawal = false, entered_at = now();
  end if;
end;
$$;

revoke all on function public.admin_add_entry(uuid, uuid, uuid) from public;
grant execute on function public.admin_add_entry(uuid, uuid, uuid) to authenticated;

-- Admin bir kaydi anketten tamamen siler. Cikis (leave_poll) degildir:
-- yanlislikla eklenen kisiyi temizler, bu yuzden gec cikis cezasi yazmaz.
create or replace function public.admin_remove_entry(
  p_match_id uuid, p_player_id uuid, p_guest_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
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

  delete from match_entries
  where match_id = p_match_id
    and ((p_player_id is not null and player_id = p_player_id)
      or (p_guest_id  is not null and guest_id  = p_guest_id));
end;
$$;

revoke all on function public.admin_remove_entry(uuid, uuid, uuid) from public;
grant execute on function public.admin_remove_entry(uuid, uuid, uuid) to authenticated;

-- join_poll, (match_id, player_id) tekilligine ON CONFLICT ile dayaniyordu.
-- Bu tekillik yukarida kismi bir indekse cevrildigi icin (player_id artik null
-- olabiliyor) catisma hedefi de kismi indeksi secebilmek adina WHERE ile
-- daraltilmali. Govdenin geri kalani 0004'teki ile aynidir.
create or replace function public.join_poll(
  p_match_id uuid, p_player_id uuid, p_offset int, p_consumed_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_offset int;
begin
  if not exists (
    select 1 from matches where id = p_match_id and status = 'poll_open'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.system_operation', '1', true);

  insert into match_entries (match_id, player_id, entry_type, offset_seconds)
  values (p_match_id, p_player_id, 'standard', p_offset)
  on conflict (match_id, player_id) where player_id is not null do update
     set withdrawn_at       = null,
         is_late_withdrawal = false,
         entered_at         = now();

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
