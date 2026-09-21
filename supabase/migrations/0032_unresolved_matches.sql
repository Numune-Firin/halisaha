-- Sonuclanmamis hafta uyarisi.
--
-- Mac saati gecmis ama hala "anket acik" ya da "kadro kesin" duran bir hafta
-- askida demektir: oynandi mi, iptal mi belli degil. Yeni hafta acilirken bu
-- fark edilmezse puan durumu ve muhasebe eksik kalir.
--
-- Bildirim tek sefer gitsin diye bayrak macin satirinda tutulur.

alter table matches
  add column if not exists unresolved_notified_at timestamptz;

-- Askidaki haftalar: mac saati gecmis, sonucu girilmemis, iptal de edilmemis.
create or replace function public.unresolved_matches()
returns table (
  id uuid,
  kickoff_at timestamptz,
  venue text,
  status match_status_t,
  notified_at timestamptz
)
language sql security definer set search_path = public as $$
  select m.id, m.kickoff_at, m.venue, m.status, m.unresolved_notified_at
    from matches m
   where is_active_member()
     and m.status in ('poll_open', 'squad_locked')
     and m.kickoff_at < now()
   order by m.kickoff_at;
$$;

revoke all on function public.unresolved_matches() from public;
grant execute on function public.unresolved_matches() to authenticated;

-- Bildirimi kapan gonderir; ayni hafta icin ikinci mail gitmez.
create or replace function public.claim_unresolved_notice(p_match_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_claimed uuid;
begin
  if not is_active_member() then
    return false;
  end if;

  update matches
     set unresolved_notified_at = now()
   where id = p_match_id
     and unresolved_notified_at is null
     and status in ('poll_open', 'squad_locked')
     and kickoff_at < now()
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_unresolved_notice(uuid) from public;
grant execute on function public.claim_unresolved_notice(uuid) to authenticated;

-- Hafta sonuclandiginda (oynandi ya da iptal) bayrak temizlenir; ileride
-- yeniden askida kalirsa tekrar haber verilebilsin.
create or replace function public.tg_clear_unresolved_notice()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('played', 'completed', 'cancelled')
     and old.status is distinct from new.status then
    new.unresolved_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_clear_unresolved_notice on matches;
create trigger matches_clear_unresolved_notice
  before update of status on matches
  for each row
  execute function public.tg_clear_unresolved_notice();
