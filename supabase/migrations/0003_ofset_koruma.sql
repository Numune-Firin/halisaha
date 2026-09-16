-- Oyuncu kendi anket satirini guncellerken yalnizca cikis_zamani alanini degistirebilir.
-- Admin (service_role veya rol='admin') bu kisitin disindadir.
create or replace function match_entries_oyuncu_korumasi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sistem RPC'leri (ankete_gir, anketten_cik) islem basinda app.sistem_islemi
  -- bayragini set eder ve bu kisittan muaf tutulur. Bayrak islem sonunda duser.
  if public.is_admin()
     or coalesce(current_setting('app.sistem_islemi', true), '0') = '1' then
    return new;
  end if;

  if new.tip <> old.tip
     or new.ofset_sn <> old.ofset_sn
     or new.vip_sira is distinct from old.vip_sira
     or new.giris_zamani <> old.giris_zamani
     or new.oyuncu_id <> old.oyuncu_id
     or new.mac_id <> old.mac_id then
    raise exception 'Bu alanlari yalnizca yonetici degistirebilir';
  end if;

  return new;
end;
$$;

create trigger match_entries_oyuncu_korumasi_trg
  before update on match_entries
  for each row execute function match_entries_oyuncu_korumasi();
