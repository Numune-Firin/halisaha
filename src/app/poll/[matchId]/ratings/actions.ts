'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';

async function requireActiveMember() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');
  return profile;
}

/**
 * Bir oyuncuya yildiz verir. Kurallarin tamami veritabanindaki rate_player
 * fonksiyonunda: mac oynanmis olmali, oy veren kadroda (ya da yonetici) olmali,
 * oy verilen kadroda olmali, kimse kendine veremez.
 */
export async function ratePlayer(
  matchId: string,
  ratee: { playerId: string | null; guestId: string | null },
  formData: FormData,
) {
  await requireActiveMember();

  const stars = Number(formData.get('stars'));
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error('Yıldız 1 ile 5 arasında olmalı');
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('rate_player', {
    p_match_id: matchId,
    p_ratee_player_id: ratee.playerId,
    p_ratee_guest_id: ratee.guestId,
    p_stars: stars,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}/ratings`);
}

/** Oylama ve yorumun kapanacagi ani yonetici belirler. */
export async function setVotingDeadline(matchId: string, formData: FormData) {
  await requireActiveMember();

  const raw = String(formData.get('closesAt') ?? '').trim();
  if (!raw) throw new Error('Tarih gir');

  // datetime-local saat dilimsiz gelir ("2026-09-17T14:30"). Sunucu Vercel'de
  // UTC calistigi icin acikca Turkiye saati (+03:00) olarak okunur; yoksa ayni
  // deger yerelde ve canlida farkli ana denk gelirdi.
  const closesAt = new Date(`${raw.slice(0, 16)}:00+03:00`);
  if (Number.isNaN(closesAt.getTime())) throw new Error('Geçerli bir tarih gir');

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('set_voting_deadline', {
    p_match_id: matchId,
    p_closes_at: closesAt.toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}/ratings`);
}

export async function addComment(matchId: string, formData: FormData) {
  const profile = await requireActiveMember();

  const body = String(formData.get('body') ?? '').trim();
  if (!body) throw new Error('Yorum boş olamaz');

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('match_comments').insert({
    match_id: matchId,
    author_id: profile.id,
    body: body.slice(0, 1000),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}/ratings`);
}

/** Kendi yorumunu ya da yonetici olarak herhangi bir yorumu siler (RLS karar verir). */
export async function deleteComment(matchId: string, commentId: string) {
  await requireActiveMember();

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('match_comments').delete().eq('id', commentId);
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}/ratings`);
}
