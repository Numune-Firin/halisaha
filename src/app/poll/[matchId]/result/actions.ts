'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { runAction } from '@/lib/actions/result';

/** Sahadan gelen diziliş: [{id, team, x, y}]. Bozuk gelirse islem yapilmaz. */
function readLineup(formData: FormData) {
  const raw = String(formData.get('lineup') ?? '[]');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Diziliş okunamadı');
  }
  if (!Array.isArray(parsed)) throw new Error('Diziliş okunamadı');
  return parsed;
}

/** Skor ve takim degisikligi puan durumunu da etkiler. */
function revalidateResult(matchId: string) {
  revalidatePath(`/poll/${matchId}`);
  revalidatePath(`/poll/${matchId}/result`);
  revalidatePath('/matches');
  revalidatePath('/standings');
  revalidatePath('/');
}

/**
 * Sahadaki dizilişi kaydeder: kim hangi takimda ve sahanin neresinde.
 *
 * Form tek bir "lineup" alani tasir, icerigi [{id, team, x, y}] listesidir.
 * Sahaya konmayan oyuncu listede yoktur; takimsiz kalir ve maci oynamamis
 * sayilir. Takim adlari buradan degismez, kaynagi "Takimlar" sayfasidir.
 */
export async function saveTeams(matchId: string, formData: FormData) {
  return runAction('Diziliş kaydedildi', async () => {
    await requireAdmin();

    const rows = readLineup(formData);

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('set_squad_lineup', {
      p_match_id: matchId,
      p_rows: rows,
    });
    if (error) throw new Error(error.message);

    revalidateResult(matchId);
  });
}

/**
 * Macin takim adlarini "Takimlar" sayfasindaki guncel iki takimla esitler.
 * Mac dogarken adlar kopyalandigi icin, takimi sonradan degistiren admin bu
 * dugmeyle acilmis anketi de guncelleyebilir. Oynanmis maclara dokunulmaz.
 */
export async function refreshTeamNames(matchId: string) {
  return runAction('Takım adları yenilendi', async () => {
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
  });
}

/** Skoru yazar ve maci "oynandi" durumuna gecirir. */
export async function saveResult(matchId: string, formData: FormData) {
  return runAction('Skor kaydedildi', async () => {
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
  });
}

/** Yanlis girilen skoru siler; mac kadro kesin durumuna doner. */
export async function clearResult(matchId: string) {
  return runAction('Skor silindi', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('clear_match_result', { p_match_id: matchId });
    if (error) throw new Error(error.message);

    revalidateResult(matchId);
  });
}
