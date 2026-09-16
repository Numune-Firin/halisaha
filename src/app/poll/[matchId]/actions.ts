'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { evaluateWithdrawal } from '@/lib/poll/withdrawal';
import { sumOffsets, consumableIds } from '@/lib/poll/offsets';

/**
 * Ankete giris. Bekleyen ceza/odulleri toplayip ofset olarak yazar ve tuketir.
 * Giris zamanini veritabani tetikleyicisi sunucu saatiyle yazar.
 *
 * Kimlik dogrulamasi burada (getCurrentProfile) yapilir. Bekleyen ceza/odul kaydi
 * normal istemciyle okunur; `adjustments_select` politikasi `is_active_member()`
 * ile herkese aciktir (RLS burada satirlari baskasinin player_id'sinden
 * gizlemez) — gercek koruma asagidaki `.eq('player_id', profile.id)` filtresi
 * ve RPC'nin kendi `p_player_id` parametresine gore tekrar filtrelemesidir.
 * Yazim, kuralca hesaplanmis degerlerle, servis anahtarli istemci uzerinden
 * yalnizca service_role'a acik olan RPC'ye tek cagriyla yapilir.
 */
export async function joinPoll(matchId: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

  const supabase = await createServerSupabase();

  const { data: pendingRows } = await supabase
    .from('adjustments')
    .select('id, player_id, seconds')
    .eq('player_id', profile.id)
    .is('applied_match_id', null);

  const pending = (pendingRows ?? []).map((r) => ({
    id: r.id as string,
    playerId: r.player_id as string,
    seconds: r.seconds as number,
  }));

  const offset = sumOffsets(pending);
  const consumed = consumableIds(pending);

  // Giris ve ceza tuketimi tek bir RPC ile, tek islemde yapilir: hem ilk giris
  // hem de cikip tekrar girme ayni yoldan gecer, ceza kayitlari ya hep birlikte
  // tuketilir ya da hic yazilmaz (kopma durumunda kaybolmaz/iki kez uygulanmaz).
  const { error } = await createServiceSupabase().rpc('join_poll', {
    p_match_id: matchId,
    p_player_id: profile.id,
    p_offset: offset,
    p_consumed_ids: consumed,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}`);
}

/** Anketten cikis. Pencere disindaysa bir sonraki ankete ceza yazar. */
export async function leavePoll(matchId: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

  const supabase = await createServerSupabase();

  const { data: match } = await supabase
    .from('matches')
    .select('kickoff_at, withdrawal_window_hours, late_withdrawal_penalty_seconds')
    .eq('id', matchId)
    .single();
  if (!match) throw new Error('Maç bulunamadı');

  const { isLate, penaltySeconds } = evaluateWithdrawal({
    now: Date.now(),
    kickoffAt: new Date(match.kickoff_at as string).getTime(),
    windowHours: match.withdrawal_window_hours as number,
    penaltySeconds: match.late_withdrawal_penalty_seconds as number,
  });

  const { error } = await createServiceSupabase().rpc('leave_poll', {
    p_match_id: matchId,
    p_player_id: profile.id,
    p_is_late: isLate,
    p_penalty_seconds: penaltySeconds,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}`);
}

/**
 * Butonun tek eylemi: hangi yonde islem yapilacagina render aninda yakalanan
 * degil, veritabaninin o anki durumuna bakarak karar verir. Sayfa render
 * edildikten sonra oyuncu baska bir sekmeden/cihazdan zaten girmis/cikmis
 * olabilir ya da butona iki kez tiklayabilir; bu durumda eski "isListed"
 * bilgisine gore dallanmak yanlis RPC'yi cagirip (orn. zaten ankette olan
 * birini tekrar "girise" sokup sirasini sifirlayarak) veri bozabilirdi.
 */
export async function togglePollEntry(matchId: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

  const supabase = await createServerSupabase();

  const { data: entry, error } = await supabase
    .from('match_entries')
    .select('withdrawn_at')
    .eq('match_id', matchId)
    .eq('player_id', profile.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const hasOpenEntry = !!entry && entry.withdrawn_at === null;

  if (hasOpenEntry) await leavePoll(matchId);
  else await joinPoll(matchId);
}
