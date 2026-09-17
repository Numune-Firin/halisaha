-- Takim dagilimi, skor ve puan durumu.
--
-- Kadro kesinlestikten sonra iki adim kalir: oyunculari siyah/beyaz takimlara
-- bolmek ve maci oynandiktan sonra skoru girmek. Puan durumu bu iki kayittan
-- turetilir; ayri bir puan tablosu tutulmaz, boylece skor duzeltildiginde
-- siralama kendiliginden guncellenir.

-- Kadrodaki herkesi tek islemde takimlara dagitir. Once butun satirlarin
-- takimi bosaltilir; boylece listeden cikarilan biri eski takiminda kalmaz.
-- Gonderilen id'ler match_squad.id'dir ve baska bir maca aitse yok sayilir.
create or replace function public.set_squad_teams(
  p_match_id uuid, p_black_ids uuid[], p_white_ids uuid[]
) returns void
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

  if v_status = 'poll_open' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  update match_squad set team = null where match_id = p_match_id;

  if array_length(p_black_ids, 1) is not null then
    update match_squad set team = 'black'
     where match_id = p_match_id and id = any(p_black_ids);
  end if;

  if array_length(p_white_ids, 1) is not null then
    update match_squad set team = 'white'
     where match_id = p_match_id and id = any(p_white_ids);
  end if;
end;
$$;

revoke all on function public.set_squad_teams(uuid, uuid[], uuid[]) from public;
grant execute on function public.set_squad_teams(uuid, uuid[], uuid[]) to authenticated;

-- Skoru yazar ve maci oynandi durumuna gecirir. Iki takimda da en az bir
-- oyuncu olmadan skor girilemez: puan durumu takim uyeliginden hesaplandigi
-- icin takimsiz bir mac kimseye galibiyet/maglubiyet yazmaz, sessizce
-- kaybolurdu.
create or replace function public.set_match_result(
  p_match_id uuid, p_black_score int, p_white_score int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if p_black_score is null or p_white_score is null then
    raise exception 'Iki takimin da skoru girilmeli';
  end if;

  if p_black_score < 0 or p_white_score < 0 then
    raise exception 'Skor negatif olamaz';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status = 'poll_open' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  if not exists (select 1 from match_squad where match_id = p_match_id and team = 'black')
     or not exists (select 1 from match_squad where match_id = p_match_id and team = 'white') then
    raise exception 'Once oyunculari iki takima dagit';
  end if;

  update matches
     set black_score = p_black_score,
         white_score = p_white_score,
         status      = 'played'
   where id = p_match_id;
end;
$$;

revoke all on function public.set_match_result(uuid, int, int) from public;
grant execute on function public.set_match_result(uuid, int, int) to authenticated;

-- Yanlis girilen skoru siler ve maci kadro kesin durumuna geri dondurur.
-- Tamamlanmis (odemesi kapanmis) maclarda calismaz.
create or replace function public.clear_match_result(p_match_id uuid)
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

  if v_status <> 'played' then
    raise exception 'Yalnizca oynanmis macin skoru silinebilir';
  end if;

  update matches
     set black_score = null, white_score = null, status = 'squad_locked'
   where id = p_match_id;
end;
$$;

revoke all on function public.clear_match_result(uuid) from public;
grant execute on function public.clear_match_result(uuid) to authenticated;
