'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';

export async function approveMember(playerId: string) {
  await requireAdmin();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', playerId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export async function openPoll(formData: FormData) {
  await requireAdmin();
  const supabase = await createServerSupabase();

  // "Sonuc yok" (aktif sezon yok / settings satiri yok) mesru bir durum olabilir
  // ve maybeSingle() ile sessizce null'a dusulur; ama sorgunun kendisi hata
  // verirse (ag, izin, vs.) bu farkli bir durumdur ve fark edilmeden sabit
  // varsayilanlara / season_id: null'a dusmek yerine firlatilmalidir — aksi
  // halde aktif bir sezon varken sezona baglanmamis bir mac sessizce olusabilir.
  const { data: settings, error: settingsError } = await supabase.from('settings').select('*').maybeSingle();
  if (settingsError) throw new Error(settingsError.message);

  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .maybeSingle();
  if (seasonError) throw new Error(seasonError.message);

  const { error: insertError } = await supabase.from('matches').insert({
    kickoff_at: formData.get('kickoffAt') as string,
    venue: (formData.get('venue') as string) ?? '',
    season_id: season?.id ?? null,
    squad_size: Number(formData.get('squadSize') ?? settings?.squad_size ?? 14),
    fee_per_player: Number(formData.get('feePerPlayer') ?? settings?.fee_per_player ?? 0),
    withdrawal_window_hours: Number(formData.get('withdrawalWindow') ?? settings?.withdrawal_window_hours ?? 20),
    late_withdrawal_penalty_seconds: Number(formData.get('lateWithdrawalPenalty') ?? settings?.late_withdrawal_penalty_seconds ?? 8),
    payment_due_on: (formData.get('paymentDueOn') as string) || null,
  });
  if (insertError) throw new Error(insertError.message);

  revalidatePath('/admin');
}

/** VIP olarak dogrudan kadroya ekler. vipRank mevcut VIP sayisinin bir fazlasidir. */
export async function addVip(matchId: string, playerId: string) {
  await requireAdmin();
  const supabase = await createServerSupabase();

  const { count, error: countError } = await supabase
    .from('match_entries')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', matchId)
    .eq('entry_type', 'vip');
  if (countError) throw new Error(countError.message);

  // upsert kullanilmaz: 0009'dan sonra (match_id, player_id) tekilligi kismi bir
  // indekstir (player_id null olabilir, aday oyuncular icin) ve PostgREST'in
  // urettigi ON CONFLICT ifadesi kismi indeksi secemez. Once var mi diye bakilir.
  const fields = { entry_type: 'vip' as const, vip_rank: (count ?? 0) + 1, withdrawn_at: null };

  const { data: existing, error: readError } = await supabase
    .from('match_entries')
    .select('id')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const { error } = existing
    ? await supabase.from('match_entries').update(fields).eq('id', existing.id)
    : await supabase
        .from('match_entries')
        .insert({ match_id: matchId, player_id: playerId, ...fields });
  if (error) throw new Error(error.message);

  revalidatePath(`/poll/${matchId}`);
  revalidatePath('/admin');
}

/** Ankete girmis bir oyuncuyu oncelikli katmanina tasir. */
export async function markPriority(matchId: string, playerId: string) {
  await requireAdmin();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('match_entries')
    .update({ entry_type: 'priority' })
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .select();
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error('Oyuncu bu ankette bulunamadı');
  revalidatePath(`/poll/${matchId}`);
}

/** Pozitif saniye ceza, negatif odul. Oyuncunun katildigi ilk ankette uygulanir. */
export async function addAdjustment(playerId: string, seconds: number, reason: string) {
  await requireAdmin();
  if (seconds === 0) throw new Error('Sıfır ceza yazılamaz');
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('adjustments').insert({ player_id: playerId, seconds, reason });
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}
