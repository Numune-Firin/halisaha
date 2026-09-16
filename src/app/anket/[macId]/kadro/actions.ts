'use server';

import { revalidatePath } from 'next/cache';
import { sunucuIstemcisi } from '@/lib/supabase/server';
import { adminGerekli } from '@/lib/supabase/adminKontrol';

/**
 * Sahada fiilen olan oyuncularla kesin kadroyu yazar ve maci kadro_kesin durumuna gecirir.
 * Anket listesinde olmayan oyuncular da eklenebilir.
 *
 * Silme + ekleme + durum gecisi tek RPC cagrisiyla, veritabani tarafinda tek
 * islemde yapilir: eklemenin herhangi bir nedenle basarisiz olup maci
 * "kadro_kesin" gorunumde ama match_squad'i bos birakmasini onler (bu tablo
 * puan/odeme hesaplarinin dayanagidir). Yetki kontrolu RPC icinde is_admin()
 * ile tekrarlanir; servis anahtarli istemci kullanilmaz, cagiran oturumun
 * kendi yetkisiyle calisir.
 */
export async function kadroyuKesinlestir(macId: string, oyuncuIdler: string[]) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();

  const { error } = await supabase.rpc('kadroyu_kesinlestir', {
    p_mac_id: macId,
    p_oyuncular: oyuncuIdler,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/anket/${macId}`);
  revalidatePath(`/anket/${macId}/kadro`);
}
