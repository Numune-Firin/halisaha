-- Oyuncu cari hesabi: fazla odeme sonraki haftalara sayilir.
--
-- Bir oyuncu hafta ucretinden fazla oderse (600 yerine 1700) aradaki fark
-- kasada durur ve o oyuncunun alacagi olur. Sonraki haftalarda once bu
-- alacaktan dusulur: 1100 alacakla giren biri ertesi hafta hic odemez
-- (alacagi 500'e iner), ondan sonraki hafta yalnizca 100 oder.
--
-- Hesap kayit tutularak degil, olaylardan turetilerek yapilir; boylece gecmise
-- donuk bir odeme duzeltilince butun zincir kendiliginden duzelir. Iki tur
-- olay vardir:
--   - mac satiri : borc (iptal haftada sifir) ve o hafta tahsil edilen para
--   - cevirme    : oyuncunun alacagindan vazgecip bagis/ikram olarak birakmasi
--
-- Iptal edilen haftada borc dogmaz ama tahsil edilmis para gercektir: oyuncunun
-- alacagina yazilir, kasada kalir.

-- Oyuncunun alacagini bagisa/ikrama cevirmesi.
--
-- Para zaten kasada oldugu icin burasi yeni bir gelir yazmaz; yalnizca
-- oyuncunun alacagini kapatir. Kasa toplami degismez, ligin parasi olur.
create table if not exists player_credit_conversions (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid references profiles(id) on delete cascade,
  guest_id   uuid references guest_players(id) on delete cascade,
  amount     numeric(10,2) not null check (amount > 0),
  category   ledger_category_t not null default 'donation',
  note       text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pcc_person_ck   check (num_nonnulls(player_id, guest_id) = 1),
  constraint pcc_note_len    check (length(note) <= 200),
  -- Oyuncunun parasini birakabilecegi iki kalem: bagis ya da ikram
  constraint pcc_category_ck check (category in ('donation', 'refreshment'))
);

create index if not exists pcc_player_idx on player_credit_conversions (player_id);
create index if not exists pcc_guest_idx  on player_credit_conversions (guest_id);

alter table player_credit_conversions enable row level security;

do $$
begin
  create policy pcc_all on player_credit_conversions for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

-- Kisi bazli hesap dokumu.
--
-- Her satir bir olaydir; balance_before olaydan onceki bakiye, due o hafta
-- gercekten odenmesi gereken tutardir (alacak dusuldukten sonra), balance_after
-- ise olaydan sonraki bakiyedir. Artı bakiye oyuncunun alacagi, eksi bakiye
-- borcudur.
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
      c.amount::numeric,  -- alacaktan dusulur, borc gibi davranir
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
    -- Once alacak yakilir; kalani nakit odenir
    greatest(0, y.charged - greatest(0, y.balance_before)) as due,
    y.balance_before + y.paid - y.charged                  as balance_after
    from yuruyen y
   where is_admin()
   order by y.occurred_at, y.full_name;
$$;

revoke all on function public.player_ledger() from public;
grant execute on function public.player_ledger() to authenticated;

-- Kisinin su anki bakiyesi. Artı ise alacakli, eksi ise borclu.
create or replace function public.player_balance(p_person_id uuid)
returns numeric
language sql security definer set search_path = public as $$
  select coalesce(
    (select sum(pl.paid - pl.charged) from public.player_ledger() pl
      where pl.person_id = p_person_id),
    0
  );
$$;

revoke all on function public.player_balance(uuid) from public;
grant execute on function public.player_balance(uuid) to authenticated;

-- Oyuncunun alacagini bagisa ya da ikrama cevirir.
create or replace function public.convert_player_credit(
  p_player_id uuid,
  p_guest_id  uuid,
  p_amount    numeric,
  p_category  ledger_category_t,
  p_note      text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_person  uuid := coalesce(p_player_id, p_guest_id);
  v_balance numeric;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if num_nonnulls(p_player_id, p_guest_id) <> 1 then
    raise exception 'Tek bir oyuncu secilmeli';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Tutar sifirdan buyuk olmali';
  end if;

  if p_category not in ('donation', 'refreshment') then
    raise exception 'Bagis ya da ikram secilmeli';
  end if;

  v_balance := public.player_balance(v_person);
  if p_amount > v_balance then
    raise exception 'Oyuncunun alacagi % TL, daha fazlasi cevrilemez', v_balance;
  end if;

  insert into player_credit_conversions (player_id, guest_id, amount, category, note, created_by)
  values (p_player_id, p_guest_id, p_amount, p_category, coalesce(btrim(p_note), ''), auth.uid());
end;
$$;

revoke all on function public.convert_player_credit(uuid, uuid, numeric, ledger_category_t, text) from public;
grant execute on function public.convert_player_credit(uuid, uuid, numeric, ledger_category_t, text) to authenticated;

-- Muhasebe kapanisi artik "herkes tam ucreti odedi mi" diye bakmaz: alacagindan
-- dusulen oyuncu daha az oder, hatta hic odemez. Olcu, kalan borcun sifir
-- olmasidir.
create or replace function public.complete_match(p_match_id uuid)
returns void
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

  select count(*) into v_missing
    from public.player_ledger() pl
   where pl.match_id = p_match_id
     and pl.paid < pl.due;

  if v_missing > 0 then
    raise exception 'Odemesi eksik % kisi var', v_missing;
  end if;

  update matches set status = 'completed' where id = p_match_id;
end;
$$;

revoke all on function public.complete_match(uuid) from public;
grant execute on function public.complete_match(uuid) to authenticated;
