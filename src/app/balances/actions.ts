'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { runAction } from '@/lib/actions/result';

/**
 * Oyuncunun alacagini bagisa ya da ikrama cevirir.
 *
 * Para zaten kasada; bu islem yalnizca "artik benim alacagim degil" demektir.
 * Kasa toplami degismez, oyuncunun bakiyesi duser.
 */
export async function convertCredit(
  personId: string,
  isGuest: boolean,
  formData: FormData,
) {
  return runAction('Alacak bağışa çevrildi', async () => {
    await requireAdmin();

    const amount = Number(String(formData.get('amount') ?? '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Tutar sıfırdan büyük olmalı');

    const category = String(formData.get('category') ?? 'donation');
    if (category !== 'donation' && category !== 'refreshment') {
      throw new Error('Bağış ya da ikram seç');
    }

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('convert_player_credit', {
      p_player_id: isGuest ? null : personId,
      p_guest_id: isGuest ? personId : null,
      p_amount: amount,
      p_category: category,
      p_note: String(formData.get('note') ?? '').trim().slice(0, 200),
    });
    if (error) throw new Error(error.message);

    revalidatePath('/balances');
    revalidatePath('/admin/accounting');

    return {
      ok: true,
      message:
        category === 'donation'
          ? 'Alacak bağış olarak yazıldı'
          : 'Alacak ikram katkısı olarak yazıldı',
    };
  });
}

/** Yanlis yazilan cevirmeyi kaldirir; tutar oyuncunun alacagina geri doner. */
export async function deleteConversion(conversionId: string) {
  return runAction('Kayıt silindi, alacak geri döndü', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase
      .from('player_credit_conversions')
      .delete()
      .eq('id', conversionId);
    if (error) throw new Error(error.message);

    revalidatePath('/balances');
    revalidatePath('/admin/accounting');
  });
}
