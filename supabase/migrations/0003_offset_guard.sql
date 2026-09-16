-- Oyuncu kendi anket satirini guncellerken yalnizca cikis zamani alanini degistirebilir.
-- Admin (service_role veya rolu 'admin' olan uye) bu kisitin disindadir.
create or replace function guard_player_entry_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sistem RPC'leri (join_poll, leave_poll) islem basinda app.system_operation
  -- bayragini set eder ve bu kisittan muaf tutulur. Bayrak islem sonunda duser.
  if public.is_admin()
     or coalesce(current_setting('app.system_operation', true), '0') = '1' then
    return new;
  end if;

  if new.entry_type <> old.entry_type
     or new.offset_seconds <> old.offset_seconds
     or new.vip_rank is distinct from old.vip_rank
     or new.entered_at <> old.entered_at
     or new.player_id <> old.player_id
     or new.match_id <> old.match_id then
    raise exception 'Bu alanlari yalnizca yonetici degistirebilir';
  end if;

  return new;
end;
$$;

create trigger match_entries_guard_trg
  before update on match_entries
  for each row execute function guard_player_entry_fields();
