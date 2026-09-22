-- Sistem sahibi.
--
-- Ligi kuran ve altyapiyi yuruten kisi. Diger yoneticiler birbirini
-- yoneticilikten cikarabilir, ama sahibi cikaramaz: bir tartisma aninda
-- sistemin sahipsiz kalmasi ya da kurucunun kendi kurdugu sistemden
-- atilmasi mumkun olmasin.
--
-- Sahiplik e-postaya baglidir ve uygulamadan degistirilemez; degismesi
-- gerekirse bu fonksiyon guncellenir.

create or replace function public.is_system_owner(p_profile uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
     where id = p_profile
       and lower(email) = 'mustafaaozcan@gmail.com'
  );
$$;

revoke all on function public.is_system_owner(uuid) from public;
grant execute on function public.is_system_owner(uuid) to authenticated;

-- Sahip her zaman yonetici sayilir; rolu elle degistirilse bile yetkisi durur.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
     where id = auth.uid()
       and status = 'active'
       and (role = 'admin' or lower(email) = 'mustafaaozcan@gmail.com')
  );
$$;

/**
 * Yoneticilik verir ya da alir.
 *
 * Iki kural: son yonetici cikarilamaz (sisteme girilemez hale gelir) ve
 * sistem sahibinin yoneticiligi dusurulemez.
 */
create or replace function public.set_member_role(p_player_id uuid, p_make_admin boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admins int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if not p_make_admin then
    if public.is_system_owner(p_player_id) then
      raise exception 'Sistem sahibinin yöneticiliği düşürülemez';
    end if;

    select count(*) into v_admins
      from profiles
     where role = 'admin' and status = 'active';

    if v_admins <= 1 then
      raise exception 'Son yöneticiyi çıkaramazsın';
    end if;
  end if;

  update profiles
     set role = case when p_make_admin then 'admin'::role_t else 'player'::role_t end
   where id = p_player_id;

  if not found then
    raise exception 'Üye bulunamadı';
  end if;
end;
$$;

revoke all on function public.set_member_role(uuid, boolean) from public;
grant execute on function public.set_member_role(uuid, boolean) to authenticated;
