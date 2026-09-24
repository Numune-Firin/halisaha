-- Borc da alacak gibi sonraki haftaya tasinir, hafta borclu kapatilabilir ve
-- bakiyeleri butun uyeler gorur.
--
-- 0047'de yalnizca alacak tasiniyordu: fazla odeyen sonraki hafta daha az
-- oderdi ama eksik odeyenin borcu ertesi haftanin ucretine eklenmiyordu. Artik
-- iki yon de ayni kuralla isler:
--
--   odenmesi gereken = hafta ucreti - onceki bakiye
--
-- 600 TL'lik haftaya 1.100 alacakla giren hic odemez (alacagi 500'e iner),
-- 400 borcla giren 1.000 oder. Bakiye sifirin altindaysa borc, ustundeyse
-- alacaktir.
create or replace function public.player_ledger()
returns table (
  person_id      uuid,
  is_guest       boolean,
  full_name      text,
  occurred_at    timestamptz,
  kind           text,
  match_id       uuid,
  squad_id       uuid,
  match_status   match_status_t,
  category       ledger_category_t,
  note           text,
  charged        numeric,
  paid           numeric,
  balance_before numeric,
  due            numeric,
  balance_after  numeric
)
language sql security definer set search_path = public as $$
  with olay as (
    select
      coalesce(ms.player_id, ms.guest_id)                  as person_id,
      (ms.player_id is null)                               as is_guest,
      coalesce(p.full_name, g.full_name, 'İsimsiz oyuncu') as full_name,
      m.kickoff_at                                         as occurred_at,
      'match'::text                                        as kind,
      m.id                                                 as match_id,
      ms.id                                                as squad_id,
      m.status                                             as match_status,
      null::ledger_category_t                              as category,
      ''::text                                             as note,
      -- Iptal edilen haftada borc dogmaz; odenmis para alacaga doner
      (case when m.status = 'cancelled' then 0 else m.fee_per_player end)::numeric as charged,
      ms.amount_paid::numeric                              as paid
      from match_squad ms
      join matches m         on m.id = ms.match_id
      left join profiles p      on p.id = ms.player_id
      left join guest_players g on g.id = ms.guest_id

    union all

    select
      coalesce(c.player_id, c.guest_id),
      (c.player_id is null),
      coalesce(p.full_name, g.full_name, 'İsimsiz oyuncu'),
      c.created_at,
      'conversion',
      null, null, null,
      c.category,
      c.note,
      c.amount::numeric,
      0::numeric
      from player_credit_conversions c
      left join profiles p      on p.id = c.player_id
      left join guest_players g on g.id = c.guest_id
  ),
  yuruyen as (
    select
      o.*,
      coalesce(
        sum(o.paid - o.charged) over (
          partition by o.person_id
          order by o.occurred_at, o.kind, o.match_id nulls last
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as balance_before
      from olay o
  )
  select
    y.person_id, y.is_guest, y.full_name, y.occurred_at, y.kind, y.match_id,
    y.squad_id, y.match_status, y.category, y.note, y.charged, y.paid,
    y.balance_before,
    -- Alacak varsa duser, borc varsa eklenir
    greatest(0, y.charged - y.balance_before) as due,
    y.balance_before + y.paid - y.charged     as balance_after
    from yuruyen y
   where is_active_member()
   order by y.occurred_at, y.full_name;
$$;

revoke all on function public.player_ledger() from public;
grant execute on function public.player_ledger() to authenticated;

-- Muhasebe kapanisi.
--
-- Eskiden herkesin borcu kapanmadan hafta kapatilamazdi. Sahada boyle olmuyor:
-- kimi o gun parasini getirmiyor, kimi eksik veriyor. Yonetici p_allow_debt ile
-- haftayi borclu kapatabilir; acik kalan tutar oyuncunun borcu olarak durur ve
-- sonraki haftanin ucretine eklenir.
drop function if exists public.complete_match(uuid);

create or replace function public.complete_match(
  p_match_id   uuid,
  p_allow_debt boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status  match_status_t;
  v_missing int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status <> 'played' then
    raise exception 'Once skoru gir';
  end if;

  if not p_allow_debt then
    select count(*) into v_missing
      from public.player_ledger() pl
     where pl.match_id = p_match_id
       and pl.paid < pl.due;

    if v_missing > 0 then
      raise exception 'Odemesi eksik % kisi var', v_missing;
    end if;
  end if;

  update matches set status = 'completed' where id = p_match_id;
end;
$$;

revoke all on function public.complete_match(uuid, boolean) from public;
grant execute on function public.complete_match(uuid, boolean) to authenticated;
