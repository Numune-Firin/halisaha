-- Uyenin e-posta adresi ve odeme hatirlatmasi.
--
-- E-posta auth.users'da duruyor ama uygulama o semayi okuyamaz; bu yuzden
-- profiles'a kopyalanir. Giris yapan herkes icin tetikleyici yazar, mevcut
-- kullanicilar icin bir kez geriye donuk doldurulur.
--
-- Hatirlatma: mac saatinden 24 saat sonra odemesi eksik olanlara mail atilir.
-- Iki kez gitmesin diye gonderim ani macin satirina yazilir.

alter table profiles
  add column if not exists email text;

alter table matches
  add column if not exists payment_reminder_sent_at timestamptz;

-- Mevcut kullanicilarin adresleri
update profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

-- Bundan sonra giris yapanlar icin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Adres degisirse profildeki kopya da guncellensin
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Hatirlatmayi yalnizca bir kez gonderebilmek icin: bayragi kapan kazanir.
-- Iki istek ayni anda gelse bile mail bir kez gider.
create or replace function public.claim_payment_reminder(p_match_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_claimed uuid;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  update matches
     set payment_reminder_sent_at = now()
   where id = p_match_id
     and payment_reminder_sent_at is null
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_payment_reminder(uuid) from public;
grant execute on function public.claim_payment_reminder(uuid) to authenticated;

-- Yanlis giden ya da tekrar gonderilmesi gereken hatirlatma icin
create or replace function public.reset_payment_reminder(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  update matches set payment_reminder_sent_at = null where id = p_match_id;
end;
$$;

revoke all on function public.reset_payment_reminder(uuid) from public;
grant execute on function public.reset_payment_reminder(uuid) to authenticated;
