'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { runAction } from '@/lib/actions/result';

function revalidateProposals(matchId: string) {
  revalidatePath(`/poll/${matchId}/proposals`);
  revalidatePath(`/poll/${matchId}`);
}

/** Sahadan gelen diziliş: [{id, team, x, y}]. */
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

/**
 * Oyuncunun kendi dizilişini kaydeder; ikinci kez kaydederse eskisinin yerine
 * gecer. Kurallar veritabanindaki save_squad_proposal fonksiyonunda: kadro
 * kesinlesmis olmali, mac saati gecmemis olmali, kadronun tamami sahada olmali.
 */
export async function saveProposal(matchId: string, formData: FormData) {
  return runAction('Önerin kaydedildi', async () => {
    const profile = await getCurrentProfile();
    if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('save_squad_proposal', {
      p_match_id: matchId,
      p_rows: readLineup(formData),
    });
    if (error) throw new Error(error.message);

    revalidateProposals(matchId);
  });
}

/** Kendi onerini siler; yonetici herhangi birini silebilir (RLS karar verir). */
export async function deleteProposal(matchId: string, proposalId: string) {
  return runAction('Öneri silindi', async () => {
    const profile = await getCurrentProfile();
    if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from('squad_proposals')
      .delete()
      .eq('id', proposalId)
      .select('id');
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) throw new Error('Bu öneriyi silemezsin');

    revalidateProposals(matchId);
  });
}

/** Yonetici bir oneriyi gercek takim dagilimina cevirir. */
export async function applyProposal(matchId: string, proposalId: string) {
  return runAction('Takımlar bu öneriye göre kuruldu', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('apply_squad_proposal', {
      p_proposal_id: proposalId,
    });
    if (error) throw new Error(error.message);

    revalidateProposals(matchId);
    revalidatePath(`/poll/${matchId}/result`);
  });
}
