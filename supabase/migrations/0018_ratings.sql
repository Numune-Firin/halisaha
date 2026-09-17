-- Mac sonrasi oylama ve yorumlar.
--
-- Mac oynandiktan sonra kadrodaki uyeler birbirine 1-5 yildiz verir ve mac icin
-- yorum yazar. Oylar gizlidir: kimin kime kac verdigini yalnizca yonetici gorur,
-- oyuncu yalnizca kendi verdigi oylari gorur. Yorumlar herkese aciktir.
--
-- Aday oyuncular Google hesabi olmadigi icin oy VEREMEZ ama oy ALABILIR;
-- bu yuzden oy verilen taraf uye ya da aday olabilir (num_nonnulls = 1).

-- Skor girmeden de maci oynandi durumuna almak icin. Oylama skoru beklemesin:
-- maci ertesi gun puanlamak isteyen admin skoru sonra girebilir.
create or replace function public.mark_match_played(p_match_id uuid)
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

  if v_status = 'cancelled' then
    raise exception 'Iptal edilmis hafta oynandi yapilamaz';
  end if;

  if v_status <> 'squad_locked' then
    raise exception 'Once kadroyu kesinlestir';
  end if;

  update matches set status = 'played' where id = p_match_id;
end;
$$;

revoke all on function public.mark_match_played(uuid) from public;
grant execute on function public.mark_match_played(uuid) to authenticated;

create table if not exists match_ratings (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references matches(id) on delete cascade,
  rater_id        uuid not null references profiles(id) on delete cascade,
  ratee_player_id uuid references profiles(id) on delete cascade,
  ratee_guest_id  uuid references guest_players(id) on delete cascade,
  stars           smallint not null check (stars between 1 and 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint match_ratings_ratee_ck check (num_nonnulls(ratee_player_id, ratee_guest_id) = 1),
  constraint match_ratings_self_ck  check (ratee_player_id is distinct from rater_id)
);

create unique index if not exists match_ratings_player_uniq
  on match_ratings (match_id, rater_id, ratee_player_id) where ratee_player_id is not null;
create unique index if not exists match_ratings_guest_uniq
  on match_ratings (match_id, rater_id, ratee_guest_id) where ratee_guest_id is not null;

alter table match_ratings enable row level security;

do $$
begin
  -- Oyuncu yalnizca kendi verdigi oylari okur; hepsini yonetici gorur
  create policy match_ratings_select on match_ratings for select
    using (is_admin() or rater_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy match_ratings_admin on match_ratings for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null;
end $$;

create table if not exists match_comments (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists match_comments_match_idx on match_comments (match_id, created_at);

alter table match_comments enable row level security;

do $$
begin
  create policy match_comments_select on match_comments for select
    using (is_active_member());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy match_comments_insert on match_comments for insert
    with check (is_active_member() and author_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  -- Kendi yorumunu silebilirsin; yonetici hepsini silebilir
  create policy match_comments_delete on match_comments for delete
    using (is_admin() or author_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- Oy verme. Kurallar tek yerde toplanir:
--   - mac oynanmis (ya da kapanmis) olmali
--   - oy veren aktif uye olmali ve ya kadroda olmali ya da yonetici olmali
--   - oy verilen o macin kadrosunda olmali
--   - kimse kendine oy veremez
-- Ayni kisiye tekrar oy verilirse yildiz guncellenir.
create or replace function public.rate_player(
  p_match_id uuid, p_ratee_player_id uuid, p_ratee_guest_id uuid, p_stars smallint
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status_t;
  v_rater  uuid := auth.uid();
begin
  if not is_active_member() then
    raise exception 'Yetkisiz';
  end if;

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Yildiz 1 ile 5 arasinda olmali';
  end if;

  if num_nonnulls(p_ratee_player_id, p_ratee_guest_id) <> 1 then
    raise exception 'Oy verilen kisi belirsiz';
  end if;

  if p_ratee_player_id = v_rater then
    raise exception 'Kendine oy veremezsin';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_status not in ('played', 'completed') then
    raise exception 'Oylama mac oynandi olarak isaretlenince acilir';
  end if;

  if not public.is_admin()
     and not exists (
       select 1 from match_squad
        where match_id = p_match_id and player_id = v_rater
     ) then
    raise exception 'Bu macin kadrosunda degilsin';
  end if;

  if not exists (
    select 1 from match_squad
     where match_id = p_match_id
       and ((p_ratee_player_id is not null and player_id = p_ratee_player_id)
         or (p_ratee_guest_id  is not null and guest_id  = p_ratee_guest_id))
  ) then
    raise exception 'Oy verilen kisi bu macin kadrosunda degil';
  end if;

  if p_ratee_player_id is not null then
    insert into match_ratings (match_id, rater_id, ratee_player_id, stars)
    values (p_match_id, v_rater, p_ratee_player_id, p_stars)
    on conflict (match_id, rater_id, ratee_player_id) where ratee_player_id is not null
    do update set stars = excluded.stars, updated_at = now();
  else
    insert into match_ratings (match_id, rater_id, ratee_guest_id, stars)
    values (p_match_id, v_rater, p_ratee_guest_id, p_stars)
    on conflict (match_id, rater_id, ratee_guest_id) where ratee_guest_id is not null
    do update set stars = excluded.stars, updated_at = now();
  end if;
end;
$$;

revoke all on function public.rate_player(uuid, uuid, uuid, smallint) from public;
grant execute on function public.rate_player(uuid, uuid, uuid, smallint) to authenticated;
