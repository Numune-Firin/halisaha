-- Skorsuz mac "oynandi" olamaz.
--
-- 0018'de mark_match_played, oylama skoru beklemesin diye eklenmisti: yonetici
-- maci oynandi isaretler, skoru ertesi gun girerdi. Uygulamada skor cogu zaman
-- hic girilmedi. Skorsuz mac puan durumuna islemedigi icin "iki mac oynandi
-- gorunuyor ama puan durumunda bir mac var" durumu olustu.
--
-- Artik maci oynandi yapmanin tek yolu skor girmektir: set_match_result skoru
-- kaydederken maci zaten 'played' yapar ve iki takimda da oyuncu olmasini
-- sarta baglar, yani puan durumuna islemeyen mac uretilemez.

drop function if exists public.mark_match_played(uuid);

-- Askidaki hafta tanimi genisledi.
--
-- Eskiden yalnizca "saati gecmis ama hala anket acik / kadro kesin" haftalar
-- askida sayiliyordu. Skorsuz kapanmis haftalar da eksiktir: oylamasi acilir,
-- parasi toplanir ama puan durumuna hic girmez. Onlar da uyariya girer ki
-- yonetici skoru girip haftayi gercekten kapatsin.
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
     and m.kickoff_at < now()
     and (
       m.status in ('poll_open', 'squad_locked')
       or (
         m.status in ('played', 'completed')
         and (m.black_score is null or m.white_score is null)
       )
     )
   order by m.kickoff_at;
$$;

revoke all on function public.unresolved_matches() from public;
grant execute on function public.unresolved_matches() to authenticated;

-- Bildirim bayragi da ayni tanimi kullanir; yoksa skorsuz hafta icin mail
-- gonderilir ama bayrak kapanmaz, her gun yeniden gonderilirdi.
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
     and kickoff_at < now()
     and (
       status in ('poll_open', 'squad_locked')
       or (
         status in ('played', 'completed')
         and (black_score is null or white_score is null)
       )
     )
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_unresolved_notice(uuid) from public;
grant execute on function public.claim_unresolved_notice(uuid) to authenticated;

-- Bayrak yalnizca hafta gercekten sonuclaninca temizlenir: iptal, ya da skoru
-- girilmis oynandi/tamamlandi. Skorsuz 'played' artik bayragi sifirlamaz.
create or replace function public.tg_clear_unresolved_notice()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled'
     or (
       new.status in ('played', 'completed')
       and new.black_score is not null
       and new.white_score is not null
     ) then
    new.unresolved_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_clear_unresolved_notice on matches;
create trigger matches_clear_unresolved_notice
  before update on matches
  for each row
  execute function public.tg_clear_unresolved_notice();
