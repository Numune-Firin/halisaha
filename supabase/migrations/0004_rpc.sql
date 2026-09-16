-- Ankete giris. Ilk giris ve cikip tekrar girme ayni yoldan gecer.
-- Tekrar giriste giris zamani sifirlanir (yeni sira), tip korunur:
-- oncelikli oyuncu tekrar girdiginde yine oncelikli katmaninda kalir.
-- Ofset yazimi ile ceza kayitlarinin tuketilmesi tek islemde gerceklesir.
-- Yalnizca service_role cagirabilir; kimlik dogrulamasi uygulama katmanindadir.
create or replace function public.ankete_gir(
  p_mac_id uuid, p_oyuncu_id uuid, p_ofset int, p_tuketilecek uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from matches where id = p_mac_id and durum = 'anket_acik'
  ) then
    raise exception 'Anket kapali';
  end if;

  perform set_config('app.sistem_islemi', '1', true);

  insert into match_entries (mac_id, oyuncu_id, tip, ofset_sn)
  values (p_mac_id, p_oyuncu_id, 'normal', p_ofset)
  on conflict (mac_id, oyuncu_id) do update
     set cikis_zamani = null,
         gec_cikis    = false,
         giris_zamani = now(),
         ofset_sn     = match_entries.ofset_sn + p_ofset;

  if array_length(p_tuketilecek, 1) is not null then
    update adjustments
       set kullanildigi_mac_id = p_mac_id
     where id = any(p_tuketilecek)
       and oyuncu_id = p_oyuncu_id
       and kullanildigi_mac_id is null;
  end if;
end;
$$;

-- Cikis ve gec cikis cezasini tek islemde yazar.
-- Yalnizca service_role cagirabilir.
create or replace function public.anketten_cik(
  p_mac_id uuid, p_oyuncu_id uuid, p_gec_cikis boolean, p_ceza_sn int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.sistem_islemi', '1', true);

  update match_entries
     set cikis_zamani = now(), gec_cikis = p_gec_cikis
   where mac_id = p_mac_id and oyuncu_id = p_oyuncu_id and cikis_zamani is null;

  if p_gec_cikis and p_ceza_sn > 0 then
    insert into adjustments (oyuncu_id, saniye, sebep, kaynak_mac_id)
    values (p_oyuncu_id, p_ceza_sn, 'Geç çıkış', p_mac_id);
  end if;
end;
$$;

revoke all on function public.ankete_gir(uuid, uuid, int, uuid[]) from public;
revoke all on function public.ankete_gir(uuid, uuid, int, uuid[]) from authenticated;
revoke all on function public.anketten_cik(uuid, uuid, boolean, int) from public;
revoke all on function public.anketten_cik(uuid, uuid, boolean, int) from authenticated;
grant execute on function public.ankete_gir(uuid, uuid, int, uuid[]) to service_role;
grant execute on function public.anketten_cik(uuid, uuid, boolean, int) to service_role;
