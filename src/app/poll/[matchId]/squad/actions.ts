'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';

/**
 * Sahada fiilen olan oyuncularla kesin kadroyu yazar ve maci squad_locked durumuna gecirir.
 * Anket listesinde olmayan oyuncular da eklenebilir.
 *
 * Silme + ekleme + durum gecisi tek RPC cagrisiyla, veritabani tarafinda tek
 * islemde yapilir: eklemenin herhangi bir nedenle basarisiz olup maci
 * "squad_locked" gorunumde ama match_squad'i bos birakmasini onler (bu tablo
 * puan/odeme hesaplarinin dayanagidir). Yetki kontrolu RPC icinde is_admin()
 * ile tekrarlanir; servis anahtarli istemci kullanilmaz, cagiran oturumun
 * kendi yetkisiyle calisir.
 */
export async function lockSquad(matchId: string, playerIds: string[]) {
  await requireAdmin();
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc('lock_squad', {
    p_match_id: matchId,
    p_player_ids: playerIds,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}`);
  revalidatePath(`/poll/${matchId}/squad`);
}
