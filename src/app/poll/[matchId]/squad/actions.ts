'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';

/**
 * Sahada fiilen olan oyuncularla kesin kadroyu yazar ve maci squad_locked durumuna gecirir.
 * Anket listesinde olmayan oyuncular ve uye olmayan aday oyuncular da eklenebilir.
 *
 * Silme + ekleme + durum gecisi tek RPC cagrisiyla, veritabani tarafinda tek
 * islemde yapilir: eklemenin herhangi bir nedenle basarisiz olup maci
 * "squad_locked" gorunumde ama match_squad'i bos birakmasini onler (bu tablo
 * puan/odeme hesaplarinin dayanagidir). Yetki kontrolu ve "kontenjan dolu mu"
 * kontrolu RPC icinde tekrarlanir; servis anahtarli istemci kullanilmaz,
 * cagiran oturumun kendi yetkisiyle calisir.
 */
export async function lockSquad(matchId: string, playerIds: string[], guestIds: string[]) {
  await requireAdmin();
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc('lock_squad', {
    p_match_id: matchId,
    p_player_ids: playerIds,
    p_guest_ids: guestIds,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}`);
  revalidatePath(`/poll/${matchId}/squad`);
}

/**
 * Kesinlesmis kadroyu geri alir: kadro satirlari silinir ve anket yeniden acilir.
 * Yanlis kisiyle kilitlendiginde ya da son anda degisiklik gerektiginde kullanilir.
 */
export async function unlockSquad(matchId: string) {
  await requireAdmin();
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc('unlock_squad', { p_match_id: matchId });
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}`);
  revalidatePath(`/poll/${matchId}/squad`);
  revalidatePath('/matches');
  revalidatePath('/');
}
