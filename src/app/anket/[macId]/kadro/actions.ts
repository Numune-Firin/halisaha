'use server';

import { revalidatePath } from 'next/cache';
import { sunucuIstemcisi } from '@/lib/supabase/server';
import { adminGerekli } from '@/lib/supabase/adminKontrol';

/**
 * Sahada fiilen olan oyuncularla kesin kadroyu yazar ve maci kadro_kesin durumuna gecirir.
 * Anket listesinde olmayan oyuncular da eklenebilir.
 */
export async function kadroyuKesinlestir(macId: string, oyuncuIdler: string[]) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();

  await supabase.from('match_squad').delete().eq('mac_id', macId);

  if (oyuncuIdler.length > 0) {
    await supabase.from('match_squad').insert(
      oyuncuIdler.map((oyuncuId) => ({ mac_id: macId, oyuncu_id: oyuncuId })),
    );
  }

  await supabase.from('matches').update({ durum: 'kadro_kesin' }).eq('id', macId);

  revalidatePath(`/anket/${macId}`);
  revalidatePath(`/anket/${macId}/kadro`);
}
