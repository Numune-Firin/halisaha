-- Kesin kadroyu tek islemde yazar: eski kadroyu siler, yenisini ekler,
-- maci kadro_kesin durumuna gecirir. Ucu birden basarili olur ya da hicbiri olmaz.
-- Yetki kontrolu fonksiyonun icinde; authenticated role acik olmasi guvenli.
create or replace function public.kadroyu_kesinlestir(
  p_mac_id uuid, p_oyuncular uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  if not exists (select 1 from matches where id = p_mac_id) then
    raise exception 'Mac bulunamadi';
  end if;

  delete from match_squad where mac_id = p_mac_id;

  if array_length(p_oyuncular, 1) is not null then
    insert into match_squad (mac_id, oyuncu_id)
    select p_mac_id, unnest(p_oyuncular);
  end if;

  update matches set durum = 'kadro_kesin' where id = p_mac_id;
end;
$$;

revoke all on function public.kadroyu_kesinlestir(uuid, uuid[]) from public;
grant execute on function public.kadroyu_kesinlestir(uuid, uuid[]) to authenticated;
