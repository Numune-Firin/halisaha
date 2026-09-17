-- Haftanin sponsoru.
--
-- Bazi haftalarda saha ucretini bir kisi ya da bir isyeri ustleniyor. Bu, o
-- haftaya ait bir bilgi oldugu icin takvimde degil macin kendi satirinda durur;
-- bos ise hicbir yerde gorunmez.

alter table matches
  add column if not exists sponsor_name text not null default '';

do $$
begin
  alter table matches add constraint matches_sponsor_name_len
    check (length(sponsor_name) <= 60);
exception when duplicate_object then null;
end $$;
