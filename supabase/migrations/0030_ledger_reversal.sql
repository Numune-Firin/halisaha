-- Ters fis (storno).
--
-- Yanlis girilen kasa hareketini silmek izi de yok eder: "bu para nereye
-- gitti" sorusunun cevabi kaybolur. Muhasebede dogrusu kaydi yerinde birakip
-- ayni tutarda ters yonlu bir fis kesmektir; ikisi birbirini gotur ve gecmis
-- okunur kalir.
--
-- reverses_id: bu satir hangi kaydin ters fisidir.
-- reversed_at: bu kayit ters fisle iptal edildi.

alter table ledger_entries
  add column if not exists reverses_id uuid references ledger_entries(id) on delete set null,
  add column if not exists reversed_at timestamptz;

-- Bir kaydin tek ters fisi olur
create unique index if not exists ledger_entries_reverses_uniq
  on ledger_entries (reverses_id) where reverses_id is not null;

create or replace function public.reverse_ledger_entry(p_entry_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_entry ledger_entries;
  v_new   uuid;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;

  select * into v_entry from ledger_entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'Kasa kaydi bulunamadi';
  end if;

  if v_entry.reversed_at is not null then
    raise exception 'Bu kayit zaten ters fisle iptal edilmis';
  end if;

  if v_entry.reverses_id is not null then
    raise exception 'Ters fisin ters fisi kesilemez';
  end if;

  insert into ledger_entries (
    season_id, match_id, direction, category, amount, description,
    occurred_on, created_by, reverses_id
  ) values (
    v_entry.season_id,
    v_entry.match_id,
    -- Yon ters cevrilir; tutar ve kalem aynen kalir ki rapor okunur olsun
    case v_entry.direction when 'income' then 'expense' else 'income' end::ledger_direction_t,
    v_entry.category,
    v_entry.amount,
    case
      when v_entry.description = '' then 'Ters fiş'
      else 'Ters fiş: ' || v_entry.description
    end,
    (now() at time zone 'Europe/Istanbul')::date,
    auth.uid(),
    v_entry.id
  )
  returning id into v_new;

  update ledger_entries set reversed_at = now() where id = v_entry.id;

  return v_new;
end;
$$;

revoke all on function public.reverse_ledger_entry(uuid) from public;
grant execute on function public.reverse_ledger_entry(uuid) to authenticated;
