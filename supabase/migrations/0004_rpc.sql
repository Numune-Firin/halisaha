-- Eski imzalar (brief'in ilk halinde join_poll(uuid, int) idi) once dusuruluyor.
-- create or replace yalnizca ayni imzali fonksiyonun govdesini degistirir; farkli
-- imzali eski bir surum varsa PUBLIC calistirma yetkisiyle yerinde kalir ve
-- asagidaki revoke/grant satirlari onu hedeflemez. Once temizle, sonra yarat.
drop function if exists public.join_poll(uuid, int);
drop function if exists public.leave_poll(uuid, uuid, boolean, int);

-- Ankete giris. Ilk giris ve cikip tekrar girme ayni yoldan gecer.
-- Tekrar giriste giris zamani sifirlanir (yeni sira), tip korunur:
-- oncelikli oyuncu tekrar girdiginde yine oncelikli katmaninda kalir.
-- Ofset yazimi ile ceza kayitlarinin tuketilmesi tek islemde gerceklesir.
-- Yalnizca service_role cagirabilir; kimlik dogrulamasi uygulama katmanindadir.
create or replace function public.join_poll(
  p_match_id uuid, p_player_id uuid, p_offset int, p_consumed_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_offset int;
begin
  if not exists (
    select 1 from matches where id = p_match_id and status = 'poll_open'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.system_operation', '1', true);

  -- Ilk giriste p_offset yazilir; tekrar giriste satirdaki ofsete DOKUNULMAZ.
  -- Iki dalda da dogru deger asagida, tuketim isaretlendikten sonra yeniden
  -- hesaplanarak yazilir.
  insert into match_entries (match_id, player_id, entry_type, offset_seconds)
  values (p_match_id, p_player_id, 'standard', p_offset)
  on conflict (match_id, player_id) do update
     set withdrawn_at       = null,
         is_late_withdrawal = false,
         entered_at         = now();

  if array_length(p_consumed_ids, 1) is not null then
    update adjustments
       set applied_match_id = p_match_id
     where id = any(p_consumed_ids)
       and player_id = p_player_id
       and applied_match_id is null;
  end if;

  -- Ofseti bu maca uygulanmis TUM ceza/odullerden yeniden hesapla.
  -- "+ p_offset" ile toplamak, butona hizli iki kez tiklandiginda (iki istek de
  -- ayni bekleyen cezayi okur) cezayi iki kez uygulayip bir kez tuketiyordu.
  -- Yeniden hesaplama her iki sorunu da cozer: ikinci cagri yeni bir kayit
  -- tuketmedigi icin ayni toplami uretir (idempotent), tekrar giriste ise ilk
  -- giriste uygulanmis cezalar toplamda kalmaya devam eder (ceza silinmez).
  select coalesce(sum(seconds), 0) into v_offset
    from adjustments
   where player_id = p_player_id and applied_match_id = p_match_id;

  update match_entries
     set offset_seconds = v_offset
   where match_id = p_match_id and player_id = p_player_id;

  -- Bayrak islem kapsamli (set_config'in ucuncu parametresi true = local).
  -- Yine de acikca sifirlanir: bu fonksiyon ileride baska bir plpgsql
  -- fonksiyonundan cagrilirsa, cagiranin geri kalani ayni islemde 0003'teki
  -- alan korumasindan sessizce muaf kalmasin.
  perform set_config('app.system_operation', '0', true);
end;
$$;

-- Cikis ve gec cikis cezasini tek islemde yazar.
-- Yalnizca service_role cagirabilir.
create or replace function public.leave_poll(
  p_match_id uuid, p_player_id uuid, p_is_late boolean, p_penalty_seconds int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not exists (
    select 1 from matches where id = p_match_id and status = 'poll_open'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.system_operation', '1', true);

  update match_entries
     set withdrawn_at = now(), is_late_withdrawal = p_is_late
   where match_id = p_match_id and player_id = p_player_id and withdrawn_at is null;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ankette acik kayit yok';
  end if;

  if p_is_late and p_penalty_seconds > 0 then
    insert into adjustments (player_id, seconds, reason, source_match_id)
    values (p_player_id, p_penalty_seconds, 'Geç çıkış', p_match_id);
  end if;

  perform set_config('app.system_operation', '0', true);
end;
$$;

revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from public;
revoke all on function public.join_poll(uuid, uuid, int, uuid[]) from authenticated;
revoke all on function public.leave_poll(uuid, uuid, boolean, int) from public;
revoke all on function public.leave_poll(uuid, uuid, boolean, int) from authenticated;
grant execute on function public.join_poll(uuid, uuid, int, uuid[]) to service_role;
grant execute on function public.leave_poll(uuid, uuid, boolean, int) to service_role;
