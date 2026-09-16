'use server';

import { revalidatePath } from 'next/cache';
import { sunucuIstemcisi } from '@/lib/supabase/server';
import { adminGerekli } from '@/lib/supabase/adminKontrol';

export async function uyeyiOnayla(oyuncuId: string) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();
  await supabase.from('profiles').update({ durum: 'aktif' }).eq('id', oyuncuId);
  revalidatePath('/admin');
}

export async function anketAc(formData: FormData) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();

  const { data: ayar } = await supabase.from('settings').select('*').single();
  const { data: sezon } = await supabase.from('seasons').select('id').eq('aktif', true).single();

  await supabase.from('matches').insert({
    mac_zamani: formData.get('macZamani') as string,
    saha: (formData.get('saha') as string) ?? '',
    sezon_id: sezon?.id ?? null,
    kadro_boyutu: Number(formData.get('kadroBoyutu') ?? ayar?.kadro_boyutu ?? 14),
    kisi_basi_ucret: Number(formData.get('kisiBasiUcret') ?? ayar?.kisi_basi_ucret ?? 0),
    cikis_penceresi_saat: Number(formData.get('cikisPenceresi') ?? ayar?.cikis_penceresi_saat ?? 20),
    gec_cikis_cezasi_sn: Number(formData.get('gecCikisCezasi') ?? ayar?.gec_cikis_cezasi_sn ?? 8),
    son_odeme_gunu: (formData.get('sonOdemeGunu') as string) || null,
  });

  revalidatePath('/admin');
}

/** VIP olarak dogrudan kadroya ekler. vipSira mevcut VIP sayisinin bir fazlasidir. */
export async function vipEkle(macId: string, oyuncuId: string) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();

  const { count } = await supabase
    .from('match_entries')
    .select('id', { count: 'exact', head: true })
    .eq('mac_id', macId)
    .eq('tip', 'vip');

  await supabase.from('match_entries').upsert(
    { mac_id: macId, oyuncu_id: oyuncuId, tip: 'vip', vip_sira: (count ?? 0) + 1, cikis_zamani: null },
    { onConflict: 'mac_id,oyuncu_id' },
  );

  revalidatePath(`/anket/${macId}`);
  revalidatePath('/admin');
}

/** Ankete girmis bir oyuncuyu oncelikli katmanina tasir. */
export async function oncelikliYap(macId: string, oyuncuId: string) {
  await adminGerekli();
  const supabase = await sunucuIstemcisi();
  await supabase
    .from('match_entries')
    .update({ tip: 'oncelikli' })
    .eq('mac_id', macId)
    .eq('oyuncu_id', oyuncuId);
  revalidatePath(`/anket/${macId}`);
}

/** Pozitif saniye ceza, negatif odul. Oyuncunun katildigi ilk ankette uygulanir. */
export async function cezaVer(oyuncuId: string, saniye: number, sebep: string) {
  await adminGerekli();
  if (saniye === 0) throw new Error('Sıfır ceza yazılamaz');
  const supabase = await sunucuIstemcisi();
  await supabase.from('adjustments').insert({ oyuncu_id: oyuncuId, saniye, sebep });
  revalidatePath('/admin');
}
