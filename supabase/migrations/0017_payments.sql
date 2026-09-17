-- Mac muhasebesi: kisi bazli odeme kaydi.
--
-- Odeme, macin kadrosuna baglidir: parayi o hafta sahaya cikan kisi oder.
-- Beklenen tutar macin fee_per_player'idir; satirda yalnizca odenen tutar
-- tutulur, boylece eksik odeme de yazilabilir.
--
-- Butun odemeler tamamlaninca mac 'completed' olur. 'played' -> 'completed'
-- gecisi yalnizca buradan yapilir; skor ve puan durumu bundan etkilenmez.

alter table match_squad
  add column if not exists amount_paid numeric(10,2) not null default 0,
  add column if not exists paid_at     timestamptz;

do $$
begin
  alter table match_squad
    add constraint match_squad_amount_paid_ck check (amount_paid >= 0);
exception when duplicate_object then null;
end $$;

-- Tek kisinin odemesini yazar. Tutar 0 ise odeme silinmis sayilir.
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

  update match_squad
     set amount_paid = p_amount,
         paid_at     = case when p_amount > 0 then coalesce(paid_at, now()) else null end
   where id = p_squad_id;
end;
$$;

revoke all on function public.set_payment(uuid, numeric) from public;
grant execute on function public.set_payment(uuid, numeric) to authenticated;

-- Oynanmis macin odemeleri kapanir. Eksik odeme varsa kac kisi kaldigini soyler.
create or replace function public.complete_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match   record;
  v_missing int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status, fee_per_player into v_match from matches where id = p_match_id;
  if v_match is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_match.status <> 'played' then
    raise exception 'Once skoru gir';
  end if;

  select count(*) into v_missing
    from match_squad
   where match_id = p_match_id and amount_paid < v_match.fee_per_player;

  if v_missing > 0 then
    raise exception 'Odemesi eksik % kisi var', v_missing;
  end if;

  update matches set status = 'completed' where id = p_match_id;
end;
$$;

revoke all on function public.complete_match(uuid) from public;
grant execute on function public.complete_match(uuid) to authenticated;

-- Yanlis kapatilan muhasebe geri acilir; odeme kayitlari yerinde kalir.
create or replace function public.reopen_match_payments(p_match_id uuid)
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

  if v_status <> 'completed' then
    raise exception 'Yalnizca kapanmis mac geri acilabilir';
  end if;

  update matches set status = 'played' where id = p_match_id;
end;
$$;

revoke all on function public.reopen_match_payments(uuid) from public;
grant execute on function public.reopen_match_payments(uuid) to authenticated;
