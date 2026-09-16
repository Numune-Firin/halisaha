'use server';

import { revalidatePath } from 'next/cache';
import { sunucuIstemcisi, aktifProfil } from '@/lib/supabase/server';
import { yoneticiIstemcisi } from '@/lib/supabase/admin';
import { cikisiDegerlendir } from '@/lib/poll/cikis';
import { toplamOfset, tuketilecekIdler } from '@/lib/poll/ofset';

/**
 * Ankete giris. Bekleyen ceza/odulleri toplayip ofset olarak yazar ve tuketir.
 * Giris zamanini veritabani tetikleyicisi sunucu saatiyle yazar.
 *
 * Kimlik dogrulamasi burada (aktifProfil) yapilir. Bekleyen ceza/odul kaydi
 * normal istemciyle okunur; `adjustments_select` politikasi `is_aktif_uye()`
 * ile herkese aciktir (RLS burada satirlari baskasinin oyuncu_id'sinden
 * gizlemez) — gercek koruma asagidaki `.eq('oyuncu_id', profil.id)` filtresi
 * ve RPC'nin kendi `p_oyuncu_id` parametresine gore tekrar filtrelemesidir.
 * Yazim, kuralca hesaplanmis degerlerle, servis anahtarli istemci uzerinden
 * yalnizca service_role'a acik olan RPC'ye tek cagriyla yapilir.
 */
export async function anketeGir(macId: string) {
  const profil = await aktifProfil();
  if (!profil || profil.durum !== 'aktif') throw new Error('Yetkisiz');

  const supabase = await sunucuIstemcisi();

  const { data: bekleyenRows } = await supabase
    .from('adjustments')
    .select('id, oyuncu_id, saniye')
    .eq('oyuncu_id', profil.id)
    .is('kullanildigi_mac_id', null);

  const bekleyenler = (bekleyenRows ?? []).map((r) => ({
    id: r.id as string,
    oyuncuId: r.oyuncu_id as string,
    saniye: r.saniye as number,
  }));

  const ofset = toplamOfset(bekleyenler);
  const tuketilecek = tuketilecekIdler(bekleyenler);

  // Giris ve ceza tuketimi tek bir RPC ile, tek islemde yapilir: hem ilk giris
  // hem de cikip tekrar girme ayni yoldan gecer, ceza kayitlari ya hep birlikte
  // tuketilir ya da hic yazilmaz (kopma durumunda kaybolmaz/iki kez uygulanmaz).
  const { error } = await yoneticiIstemcisi().rpc('ankete_gir', {
    p_mac_id: macId,
    p_oyuncu_id: profil.id,
    p_ofset: ofset,
    p_tuketilecek: tuketilecek,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/anket/${macId}`);
}

/** Anketten cikis. Pencere disindaysa bir sonraki ankete ceza yazar. */
export async function anketenCik(macId: string) {
  const profil = await aktifProfil();
  if (!profil || profil.durum !== 'aktif') throw new Error('Yetkisiz');

  const supabase = await sunucuIstemcisi();

  const { data: mac } = await supabase
    .from('matches')
    .select('mac_zamani, cikis_penceresi_saat, gec_cikis_cezasi_sn')
    .eq('id', macId)
    .single();
  if (!mac) throw new Error('Maç bulunamadı');

  const { gecCikis, cezaSn } = cikisiDegerlendir({
    simdi: Date.now(),
    macZamani: new Date(mac.mac_zamani as string).getTime(),
    cikisPenceresiSaat: mac.cikis_penceresi_saat as number,
    gecCikisCezasiSn: mac.gec_cikis_cezasi_sn as number,
  });

  const { error } = await yoneticiIstemcisi().rpc('anketten_cik', {
    p_mac_id: macId,
    p_oyuncu_id: profil.id,
    p_gec_cikis: gecCikis,
    p_ceza_sn: cezaSn,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/anket/${macId}`);
}

/**
 * Butonun tek eylemi: hangi yonde islem yapilacagina render aninda yakalanan
 * degil, veritabaninin o anki durumuna bakarak karar verir. Sayfa render
 * edildikten sonra oyuncu baska bir sekmeden/cihazdan zaten girmis/cikmis
 * olabilir ya da butona iki kez tiklayabilir; bu durumda eski "kendisiListede"
 * bilgisine gore dallanmak yanlis RPC'yi cagirip (orn. zaten ankette olan
 * birini tekrar "girise" sokup sirasini sifirlayarak) veri bozabilirdi.
 */
export async function anketeGirVeyaCik(macId: string) {
  const profil = await aktifProfil();
  if (!profil || profil.durum !== 'aktif') throw new Error('Yetkisiz');

  const supabase = await sunucuIstemcisi();

  const { data: kayit, error } = await supabase
    .from('match_entries')
    .select('cikis_zamani')
    .eq('mac_id', macId)
    .eq('oyuncu_id', profil.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const acikKaydiVar = !!kayit && kayit.cikis_zamani === null;

  if (acikKaydiVar) await anketenCik(macId);
  else await anketeGir(macId);
}
