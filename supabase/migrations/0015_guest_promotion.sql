-- Aday oyuncunun asil oyuncuya gecmesi.
--
-- Aday oyuncu, Google hesabi olmadigi icin profiles'a yazilamaz; guest_players
-- satirinda kalir. "Asil oyuncu" burada bir etikettir: yeterince mac oynamis,
-- artik gruptan sayilan kisiyi isaretler. Google ile giris yapip uye olmasi
-- ayri bir istir ve bu bayrak onu engellemez.
--
-- Kural: belirlenen sayida mac oynayan aday kendiliginden asil olur. Admin
-- elle de degistirebilir; elle dokunulan kayda otomatik kural bir daha
-- karismaz (promotion_locked), yoksa sonraki mac onu geri ceviriyordu.

alter table guest_players
  add column if not exists is_regular       boolean not null default false,
  add column if not exists promoted_at      timestamptz,
  add column if not exists promotion_locked boolean not null default false;

-- Esik grup ayarlarinda durur; degistirmek icin migration gerekmesin.
alter table settings
  add column if not exists guest_promotion_matches int not null default 3;

do $$
begin
  alter table settings
    add constraint settings_guest_promotion_matches_ck
    check (guest_promotion_matches >= 1);
exception when duplicate_object then null;
end $$;

-- Esigi dolduran butun adaylari asil yapar ve kac kisiyi cevirdigini doner.
-- Yalnizca yukari yonde calisir: kimseyi adayliga geri dusurmez.
create or replace function public.promote_eligible_guests()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_threshold int;
  v_count     int;
begin
  select guest_promotion_matches into v_threshold from settings where id;
  v_threshold := coalesce(v_threshold, 3);

  with played as (
    select ms.guest_id, count(*) as match_count
      from match_squad ms
      join matches m on m.id = ms.match_id
     where ms.guest_id is not null
       and m.status in ('played', 'completed')
     group by ms.guest_id
  )
  update guest_players g
     set is_regular  = true,
         promoted_at = now()
    from played p
   where p.guest_id = g.id
     and p.match_count >= v_threshold
     and not g.is_regular
     and not g.promotion_locked;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.promote_eligible_guests() from public;
grant execute on function public.promote_eligible_guests() to authenticated;

create or replace function public.tg_promote_eligible_guests()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.promote_eligible_guests();
  return null;
end;
$$;

-- Iki ayri an: skor girilip mac "oynandi"ya gectiginde ve kadro satirlari
-- sonradan yazildiginda (demo verisi ile eski maclarda sira boyle isliyor).
drop trigger if exists matches_promote_guests on matches;
create trigger matches_promote_guests
  after update of status on matches
  for each row
  when (new.status in ('played', 'completed') and old.status is distinct from new.status)
  execute function public.tg_promote_eligible_guests();

drop trigger if exists match_squad_promote_guests on match_squad;
create trigger match_squad_promote_guests
  after insert on match_squad
  for each statement
  execute function public.tg_promote_eligible_guests();

-- Bugune kadar oynanmis maclar icin bir kez calistirilir.
select public.promote_eligible_guests();
