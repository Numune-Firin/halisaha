-- Anket listesinin canli guncellenmesi icin match_entries tablosunu
-- Supabase Realtime yayinina ekler. Yayinda zaten varsa hata vermez.
do $$
begin
  alter publication supabase_realtime add table public.match_entries;
exception
  when duplicate_object then null;
end;
$$;
