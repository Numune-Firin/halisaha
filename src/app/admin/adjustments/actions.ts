'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';

/**
 * Ceza ve odul ayni tabloda, tek alanla tutulur: saniye. Arti saniye giris
 * saatini ileri atar (ceza), eksi saniye one ceker (odul). Kayit bekleyen
 * kaldigi surece oyuncunun girdigi ilk ankette tuketilir.
 */
export async function createAdjustment(formData: FormData) {
  await requireAdmin();

  const playerId = String(formData.get('playerId') ?? '');
  const kind = String(formData.get('kind') ?? 'penalty');
  const seconds = Number(formData.get('seconds'));
  const reason = String(formData.get('reason') ?? '').trim();

  if (!playerId) throw new Error('Oyuncu seç');
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error('Saniye sıfırdan büyük bir tam sayı olmalı');
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('adjustments').insert({
    player_id: playerId,
    seconds: kind === 'reward' ? -seconds : seconds,
    reason,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/adjustments');
}

/**
 * Yanlis yazilan kayit silinir. Tuketilmis kayit da silinebilir; silmek gecmis
 * anketteki siralamayi degistirmez, yalnizca listeden kaldirir.
 */
export async function deleteAdjustment(adjustmentId: string) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('adjustments').delete().eq('id', adjustmentId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/adjustments');
}
