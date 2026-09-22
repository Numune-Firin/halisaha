-- Istek, sikayet ve tesekkurler.
--
-- Grup icindeki dilekler simdiye kadar sahada ya da WhatsApp'ta soyleniyordu;
-- unutuluyor, kimin neyi istedigi kayboluyordu. Artik uye yazar, yonetici
-- okur, cevaplar ve durumunu isaretler.
--
-- Kayitlar isimlidir: kim yazdiysa yonetici gorur. Baskasinin yazdigini kimse
-- goremez; herkes yalnizca kendi kaydini ve ona gelen cevaplari okur.

do $$
begin
  create type feedback_kind_t as enum ('request', 'complaint', 'thanks');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type feedback_status_t as enum ('new', 'in_review', 'resolved', 'closed');
exception when duplicate_object then null;
end $$;

create table if not exists feedback_items (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references profiles(id) on delete cascade,
  kind       feedback_kind_t not null,
  subject    text not null,
  body       text not null,
  status     feedback_status_t not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_subject_len check (length(btrim(subject)) between 3 and 120),
  constraint feedback_body_len    check (length(btrim(body)) between 3 and 2000)
);

create index if not exists feedback_items_author_idx
  on feedback_items (author_id, created_at desc);

create index if not exists feedback_items_status_idx
  on feedback_items (status, created_at desc);

-- Yonetici cevaplari. Gonderen kendi kaydinin cevaplarini okur.
create table if not exists feedback_replies (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references feedback_items(id) on delete cascade,
  author_id   uuid not null references profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint feedback_reply_len check (length(btrim(body)) between 1 and 2000)
);

create index if not exists feedback_replies_item_idx
  on feedback_replies (item_id, created_at);

alter table feedback_items   enable row level security;
alter table feedback_replies enable row level security;

do $$
begin
  -- Herkes kendi yazdigini gorur; yonetici hepsini
  create policy feedback_items_select on feedback_items for select
    using (is_admin() or author_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  -- Yazan yalnizca kendi adina yazabilir
  create policy feedback_items_insert on feedback_items for insert
    with check (is_active_member() and author_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  -- Durumu yalnizca yonetici degistirir
  create policy feedback_items_update on feedback_items for update
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

do $$
begin
  -- Yazan kendi kaydini silebilir; yonetici hepsini
  create policy feedback_items_delete on feedback_items for delete
    using (is_admin() or author_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  -- Cevaplar, kaydi gorebilen tarafindan okunur
  create policy feedback_replies_select on feedback_replies for select
    using (
      exists (
        select 1 from feedback_items i
         where i.id = item_id
           and (is_admin() or i.author_id = auth.uid())
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  -- Cevabi yalnizca yonetici yazar
  create policy feedback_replies_insert on feedback_replies for insert
    with check (is_admin() and author_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy feedback_replies_delete on feedback_replies for delete
    using (is_admin());
exception when duplicate_object then null;
end $$;

-- Cevap yazildiginda kayit "inceleniyor"a gecer; yonetici ayrica
-- "cozuldu" diyene kadar acik kalir.
create or replace function public.tg_feedback_touch()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update feedback_items
     set updated_at = now(),
         status = case when status = 'new' then 'in_review' else status end
   where id = new.item_id;
  return new;
end;
$$;

drop trigger if exists feedback_replies_touch on feedback_replies;
create trigger feedback_replies_touch
  after insert on feedback_replies
  for each row
  execute function public.tg_feedback_touch();

/** Yoneticiye bekleyen kayit sayisi: menudeki rozet bunu kullanir. */
create or replace function public.open_feedback_count()
returns int
language sql stable security definer set search_path = public as $$
  select case
           when is_admin() then
             (select count(*)::int from feedback_items
               where status in ('new', 'in_review'))
           else 0
         end;
$$;

revoke all on function public.open_feedback_count() from public;
grant execute on function public.open_feedback_count() to authenticated;
