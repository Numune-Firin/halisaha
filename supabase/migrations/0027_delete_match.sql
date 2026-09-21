-- Yanlislikla acilan maci silme.
--
-- Bugune kadar tek care iptal etmekti: mac listede kaliyordu. Elle acilan bir
-- ara mac yanlis saatle acildiysa onu tamamen kaldirabilmek gerekiyor.
--
-- Guvenlik icin yalnizca "gecmisi olmayan" mac silinebilir: kadrosu
-- kesinlesmemis, skoru girilmemis, odemesi yazilmamis. Oynanmis bir mac
-- silinemez; o puan durumunun ve muhasebenin parcasidir.

create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match record;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select status, black_score, white_score into v_match from matches where id = p_match_id;
  if v_match is null then
    raise exception 'Mac bulunamadi';
  end if;

  if v_match.status not in ('poll_open', 'cancelled') then
    raise exception 'Yalnizca anketi acik ya da iptal edilmis mac silinebilir';
  end if;

  if v_match.black_score is not null or v_match.white_score is not null then
    raise exception 'Skoru girilmis mac silinemez';
  end if;

  if exists (select 1 from match_squad where match_id = p_match_id) then
    raise exception 'Kadrosu olan mac silinemez, once kadroyu geri al';
  end if;

  if exists (select 1 from ledger_entries where match_id = p_match_id) then
    raise exception 'Kasa hareketi olan mac silinemez';
  end if;

  -- Anket girisleri ve o maca bagli kayitlar cascade ile gider
  delete from matches where id = p_match_id;
end;
$$;

revoke all on function public.delete_match(uuid) from public;
grant execute on function public.delete_match(uuid) to authenticated;
