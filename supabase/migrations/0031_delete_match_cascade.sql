-- Mac silinince ona bagli her sey gider.
--
-- Once yalnizca "gecmisi olmayan" mac silinebiliyordu: kadrosu, skoru ya da
-- kasa kaydi olan mac korunuyordu. Pratikte yanlis acilmis bir mac da
-- kadrosuyla, odemesiyle, kasa kaydiyla birlikte duruyor ve temizlenemiyordu.
--
-- Artik silme islemi maca bagli her seyi birlikte goturur:
--   anket girisleri, kadro ve odemeler, takim dagilimi, oylar, yorumlar
--   (hepsi match_id uzerinden cascade) ve o maca yazilmis kasa hareketleri.
--
-- Tek kural: muhasebesi kapanmis (tamamlandi) mac once geri acilmali. Kapanmis
-- hesabin sessizce yok olmamasi icin.

create or replace function public.delete_match(p_match_id uuid)
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

  if v_status = 'completed' then
    raise exception 'Muhasebesi kapanmis mac silinemez, once muhasebeyi geri ac';
  end if;

  -- Kasa hareketleri maca "set null" ile bagli oldugu icin kendiliginden
  -- gitmez; ortada kalmasinlar diye burada silinir.
  delete from ledger_entries where match_id = p_match_id;

  -- Geri kalan her sey (giris, kadro, oy, yorum, MVP hakki) cascade ile gider
  delete from matches where id = p_match_id;
end;
$$;

revoke all on function public.delete_match(uuid) from public;
grant execute on function public.delete_match(uuid) to authenticated;
