-- Gecmis haftanin onerileri silinir.
--
-- Oneri yalnizca mac oncesi anlamlidir: kim hangi takimda oynasin diye
-- tartisilir, mac oynanir, biter. Sonrasinda o satirlar kimsenin isine
-- yaramaz, sadece yer kaplar.
--
-- Temizlik iki yerde:
--   1) Mac sonuclandigi anda (oynandi / tamamlandi / iptal) tetikleyici siler.
--   2) Gunluk bakim isi, saati gecmis maclarda kalani toplar (bkz. /api/cron).
--
-- Slot satirlari onerilere cascade ile bagli oldugu icin kendiliginden gider.

create or replace function public.tg_clear_squad_proposals()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('played', 'completed', 'cancelled')
     and old.status is distinct from new.status then
    delete from squad_proposals where match_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_clear_squad_proposals on matches;
create trigger matches_clear_squad_proposals
  after update of status on matches
  for each row
  execute function public.tg_clear_squad_proposals();

/**
 * Saati gecmis maclarda kalan onerileri siler; kac oneri gittigini dondurur.
 * Tetikleyici bir sekilde calismadiysa (ornegin mac durumu elle degistiyse)
 * gunluk bakim bu artiklari toplar.
 */
create or replace function public.cleanup_old_proposals()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_deleted int;
begin
  if not (is_active_member() or is_system_caller()) then
    return 0;
  end if;

  with gone as (
    delete from squad_proposals sp
     using matches m
     where m.id = sp.match_id
       and m.kickoff_at < now()
    returning sp.id
  )
  select count(*) into v_deleted from gone;

  return v_deleted;
end;
$$;

revoke all on function public.cleanup_old_proposals() from public;
grant execute on function public.cleanup_old_proposals() to authenticated, service_role;
