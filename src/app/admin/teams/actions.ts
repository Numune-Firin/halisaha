'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { runAction } from '@/lib/actions/result';

/** Takim degisikligi yeni acilacak maclarin adlarini da etkiler. */
function revalidateTeams() {
  revalidatePath('/admin/teams');
  revalidatePath('/admin');
  revalidatePath('/');
}

function readName(value: FormDataEntryValue | null) {
  const name = String(value ?? '').trim();
  if (!name) throw new Error('Takım adı boş olamaz');
  return name.slice(0, 24);
}

export async function createTeam(formData: FormData) {
  return runAction('Takım eklendi', async () => {
    await requireAdmin();
    const name = readName(formData.get('name'));

    const supabase = await createServerSupabase();
    const { error } = await supabase.from('teams').insert({ name });
    // Ayni ad iki kez tanimlanamaz; hatayi anlasilir kil
    if (error) throw new Error(error.code === '23505' ? 'Bu adda bir takım zaten var' : error.message);

    revalidateTeams();
  });
}

export async function renameTeam(teamId: string, formData: FormData) {
  return runAction('Takım adı kaydedildi', async () => {
    await requireAdmin();
    const name = readName(formData.get('name'));

    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from('teams')
      .update({ name })
      .eq('id', teamId)
      .select('id');
    if (error) throw new Error(error.code === '23505' ? 'Bu adda bir takım zaten var' : error.message);
    if ((data ?? []).length === 0) throw new Error('Takım bulunamadı');

    revalidateTeams();
  });
}

/**
 * Takimi 1. ya da 2. sira olarak sahaya cikarir; slot null ise pasife ceker.
 * Slot degisimi tek islemde oldugu icin iki takim ayni siraya dusemez.
 */
export async function setTeamSlot(teamId: string, slot: 1 | 2 | null) {
  return runAction('Sahadaki takımlar güncellendi', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('set_team_slot', {
      p_team_id: teamId,
      p_slot: slot,
    });
    if (error) throw new Error(error.message);

    revalidateTeams();
  });
}

/** Aktif takim silinemez; once pasife cekilmesi gerekir. */
export async function deleteTeam(teamId: string) {
  return runAction('Takım silindi', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { data: team, error: readError } = await supabase
      .from('teams')
      .select('active_slot')
      .eq('id', teamId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!team) throw new Error('Takım bulunamadı');
    if (team.active_slot !== null) throw new Error('Önce takımı sahadan çıkar');

    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) throw new Error(error.message);

    revalidateTeams();
  });
}
