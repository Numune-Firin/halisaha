-- E-posta ile davet.
--
-- Bir kisiyi uye ya da yonetici yapabilmek icin once onun Google ile giris
-- yapmasi gerekiyordu: profiles satiri auth.users'a bagli. Bu yuzden "sunu
-- yonetici yapayim" dedigin anda yapacak kimse olmuyordu.
--
-- Davet bunu cozer: adresi onceden yazarsin, o kisi Google ile girdigi anda
-- onay beklemeden aktif uye olur; davette isaretlediysen yonetici olarak acilir.

create table if not exists member_invites (
  email       text primary key,
  make_admin  boolean not null default false,
  note        text not null default '',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references profiles(id) on delete set null,
  constraint member_invites_email_ck check (position('@' in email) > 1),
  constraint member_invites_note_len check (length(note) <= 120)
);

alter table member_invites enable row level security;

do $$
begin
  -- Davetler yalnizca yoneticiyi ilgilendirir
  create policy member_invites_admin on member_invites for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

-- Giris yapan kisinin adresi davetliyse dogrudan aktif uye olur.
-- Davet yoksa eski davranis surer: onay bekleyen uye olarak acilir.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invite member_invites;
begin
  select * into v_invite
    from member_invites
   where lower(email) = lower(new.email)
     and accepted_at is null;

  insert into public.profiles (id, full_name, avatar_url, email, status, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    new.email,
    case when v_invite.email is null then 'pending' else 'active' end::member_status_t,
    case when coalesce(v_invite.make_admin, false) then 'admin' else 'player' end::role_t
  )
  on conflict (id) do update set email = excluded.email;

  if v_invite.email is not null then
    update member_invites
       set accepted_at = now(), accepted_by = new.id
     where email = v_invite.email;
  end if;

  return new;
end;
$$;
