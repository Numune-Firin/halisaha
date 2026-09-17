'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';

/** Skor ve takim degisikligi puan durumunu da etkiler. */
function revalidateResult(matchId: string) {
  revalidatePath(`/poll/${matchId}`);
  revalidatePath(`/poll/${matchId}/result`);
  revalidatePath('/matches');
  revalidatePath('/standings');
  revalidatePath('/');
}

/**
 * Kadroyu iki takima dagitir. Form alanlari "team:<match_squad.id>" adiyla
 * gelir, degeri black/white; takimi secilmeyen oyuncu icin alan hic
 * gonderilmez. Takim adlari buradan degismez, kaynagi "Takimlar" sayfasidir.
 */
export async function saveTeams(matchId: string, formData: FormData) {
  await requireAdmin();

  const blackIds: string[] = [];
  const whiteIds: string[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('team:')) continue;
    const squadRowId = key.slice('team:'.length);
    if (value === 'black') blackIds.push(squadRowId);
    else if (value === 'white') whiteIds.push(squadRowId);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('set_squad_teams', {
    p_match_id: matchId,
    p_black_ids: blackIds,
    p_white_ids: whiteIds,
  });
  if (error) throw new Error(error.message);

  revalidateResult(matchId);
}

/**
 * Macin takim adlarini "Takimlar" sayfasindaki guncel iki takimla esitler.
 * Mac dogarken adlar kopyalandigi icin, takimi sonradan degistiren admin bu
 * dugmeyle acilmis anketi de guncelleyebilir. Oynanmis maclara dokunulmaz.
 */
export async function refreshTeamNames(matchId: string) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { data: teams, error: teamError } = await supabase
    .from('teams')
    .select('name, active_slot')
    .not('active_slot', 'is', null);
  if (teamError) throw new Error(teamError.message);

  const slot = (value: number) =>
    (teams ?? []).find((t) => t.active_slot === value)?.name as string | undefined;

  const { error } = await supabase.rpc('set_team_names', {
    p_match_id: matchId,
    p_black_name: slot(1) ?? 'Siyah',
    p_white_name: slot(2) ?? 'Beyaz',
  });
  if (error) throw new Error(error.message);

  revalidateResult(matchId);
}

/** Skoru yazar ve maci "oynandi" durumuna gecirir. */
export async function saveResult(matchId: string, formData: FormData) {
  await requireAdmin();

  const blackScore = Number(formData.get('blackScore'));
  const whiteScore = Number(formData.get('whiteScore'));
  if (!Number.isInteger(blackScore) || !Number.isInteger(whiteScore)) {
    throw new Error('Skor tam sayı olmalı');
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('set_match_result', {
    p_match_id: matchId,
    p_black_score: blackScore,
    p_white_score: whiteScore,
  });
  if (error) throw new Error(error.message);

  revalidateResult(matchId);
}

/** Yanlis girilen skoru siler; mac kadro kesin durumuna doner. */
export async function clearResult(matchId: string) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('clear_match_result', { p_match_id: matchId });
  if (error) throw new Error(error.message);

  revalidateResult(matchId);
}
