-- Hafta iptali: tatil, kar, kontenjanin dolmamasi gibi sebeplerle o haftanin
-- maci oynanmaz.
--
-- Mac SILINMEZ, 'cancelled' durumuna alinir. Bunun iki sebebi var:
-- 1) Iptal edilen hafta listede kalir, oyuncular "bu hafta yok" bilgisini gorur.
-- 2) Haftalik takvim (ensure_scheduled_matches) ayni gun+saat icin zaten satir
--    varsa yenisini uretmez; satir durdugu surece iptal edilen hafta kendi
--    kendine geri acilmaz.
--
-- status_before_cancel iptal aninda onceki durumu saklar; geri alindiginda mac
-- tam olarak birakildigi yere doner.

alter type match_status_t add value if not exists 'cancelled';

alter table matches
  add column if not exists cancellation_reason  text,
  add column if not exists status_before_cancel match_status_t;

-- Oynanmis ya da odemesi kapanmis mac iptal edilemez: o hafta zaten yasandi.
create or replace function public.cancel_match(p_match_id uuid, p_reason text)
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

  if v_status = 'cancelled' then
    raise exception 'Bu hafta zaten iptal edilmis';
  end if;

  if v_status in ('played', 'completed') then
    raise exception 'Oynanmis mac iptal edilemez';
  end if;

  update matches
     set status_before_cancel = status,
         status               = 'cancelled',
         cancellation_reason  = nullif(btrim(p_reason), '')
   where id = p_match_id;
end;
$$;

revoke all on function public.cancel_match(uuid, text) from public;
grant execute on function public.cancel_match(uuid, text) to authenticated;

-- Yanlislikla iptal edilen haftayi birakildigi duruma geri dondurur.
create or replace function public.restore_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
  v_before match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status, status_before_cancel into v_status, v_before
    from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status <> 'cancelled' then
    raise exception 'Yalnizca iptal edilmis hafta geri alinabilir';
  end if;

  update matches
     set status               = coalesce(v_before, 'poll_open'),
         status_before_cancel = null,
         cancellation_reason  = null
   where id = p_match_id;
end;
$$;

revoke all on function public.restore_match(uuid) from public;
grant execute on function public.restore_match(uuid) to authenticated;
