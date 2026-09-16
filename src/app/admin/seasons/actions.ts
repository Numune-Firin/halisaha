'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * Veritabaninda ayni anda yalnizca bir aktif sezon olabilir
 * (seasons_single_active kisitli tekil indeksi), bu yuzden yeni bir sezonu
 * aktif etmeden once mevcut aktif sezon pasife alinir.
 */
async function deactivateActiveSeasons(supabase: ServerSupabase) {
  const { error } = await supabase
    .from('seasons')
    .update({ is_active: false })
    .eq('is_active', true);
  if (error) throw new Error(error.message);
}

function readSeasonForm(formData: FormData) {
  const name = ((formData.get('name') as string) ?? '').trim();
  const startsOn = (formData.get('startsOn') as string) ?? '';
  const endsOn = ((formData.get('endsOn') as string) ?? '').trim() || null;

  if (!name) throw new Error('Sezon adı boş bırakılamaz');
  if (!startsOn) throw new Error('Başlangıç tarihi gerekli');
  if (endsOn && endsOn < startsOn) throw new Error('Bitiş tarihi başlangıçtan önce olamaz');

  return { name, startsOn, endsOn };
}

export async function createSeason(formData: FormData) {
  await requireAdmin();
  const { name, startsOn, endsOn } = readSeasonForm(formData);
  const makeActive = formData.get('makeActive') === 'on';

  const supabase = await createServerSupabase();
  if (makeActive) await deactivateActiveSeasons(supabase);

  const { error } = await supabase.from('seasons').insert({
    name,
    starts_on: startsOn,
    ends_on: endsOn,
    is_active: makeActive,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/seasons');
  revalidatePath('/admin');
  revalidatePath('/');
}

export async function updateSeason(seasonId: string, formData: FormData) {
  await requireAdmin();
  const { name, startsOn, endsOn } = readSeasonForm(formData);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('seasons')
    .update({ name, starts_on: startsOn, ends_on: endsOn })
    .eq('id', seasonId)
    .select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error('Sezon bulunamadı');

  revalidatePath('/admin/seasons');
  revalidatePath('/admin');
  revalidatePath('/');
}

/** Secilen sezonu aktif yapar; digerleri kendiliginden pasife duser. */
export async function activateSeason(seasonId: string) {
  await requireAdmin();
  const supabase = await createServerSupabase();

  await deactivateActiveSeasons(supabase);

  const { data, error } = await supabase
    .from('seasons')
    .update({ is_active: true })
    .eq('id', seasonId)
    .select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error('Sezon bulunamadı');

  revalidatePath('/admin/seasons');
  revalidatePath('/admin');
  revalidatePath('/');
}

/** Sezonu kapatir. Bitis tarihi girilmemisse bugun olarak yazilir. */
export async function closeSeason(seasonId: string) {
  await requireAdmin();
  const supabase = await createServerSupabase();

  const { data: season, error: readError } = await supabase
    .from('seasons')
    .select('id, ends_on')
    .eq('id', seasonId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!season) throw new Error('Sezon bulunamadı');

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('seasons')
    .update({ is_active: false, ends_on: season.ends_on ?? today })
    .eq('id', seasonId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/seasons');
  revalidatePath('/admin');
  revalidatePath('/');
}
