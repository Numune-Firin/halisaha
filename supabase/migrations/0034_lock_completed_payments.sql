-- Kapanmis muhasebe kilitlenir.
--
-- Simdiye kadar "Muhasebeyi kapat" dedikten sonra da odemeler
-- degistirilebiliyordu: kapanmis bir haftanin tutari sessizce degisiyor, kasa
-- ozeti ile hafta ozeti birbirini tutmayabiliyordu.
--
-- Artik kapanmis haftada odeme yazilamaz. Yonetici yine her seyi yapabilir,
-- ama once "Muhasebeyi geri ac" demesi gerekir: degisiklik bilincli olsun.

create or replace function public.set_payment(p_squad_id uuid, p_amount numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Tutar negatif olamaz';
  end if;

  select m.status into v_status
    from match_squad ms join matches m on m.id = ms.match_id
   where ms.id = p_squad_id;

  if v_status is null then
    raise exception 'Kadro satiri bulunamadi';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta icin odeme yazilamaz';
  end if;

  if v_status = 'completed' then
    -- Bu metin kullaniciya oldugu gibi gorunur, o yuzden duzgun Turkce
    raise exception 'Bu haftanın muhasebesi kapandı. Önce "Muhasebeyi geri aç" de.';
  end if;

  update match_squad
     set amount_paid = p_amount,
         paid_at     = case when p_amount > 0 then coalesce(paid_at, now()) else null end
   where id = p_squad_id;
end;
$$;

revoke all on function public.set_payment(uuid, numeric) from public;
grant execute on function public.set_payment(uuid, numeric) to authenticated;
