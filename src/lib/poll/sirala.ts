import type { AnketGirisi, SiraliOyuncu } from './types';

/** Katman sirasi: kucuk sayi once gelir. Ofset bu sirayi degistiremez. */
const KATMAN_SIRASI = { vip: 0, oncelikli: 1, normal: 2 } as const;

/**
 * Anket listesini sistemin tek dogru sirasina gore dizer.
 *
 * Katmanlar: VIP -> Oncelikli -> Normal. Ofset katman atlatmaz.
 * VIP katmani admin'in verdigi vipSira duzenindedir.
 * Diger katmanlarda: efektifZaman = girisZamani + ofsetSn * 1000 (ofsetSn saniye,
 * girisZamani ms), alt sinir anketAcilis.
 * Esitlik bozucu her zaman gercek giris zamanidir, en son da oyuncuId (deterministik
 * olsun diye) — boylece karsilastirici hicbir durumda kararsiz kalmaz.
 *
 * Cikmis oyuncular (cikisZamani dolu) listede yer almaz.
 */
export function anketiSirala({
  girisler,
  anketAcilis,
  kadroBoyutu,
}: {
  girisler: AnketGirisi[];
  anketAcilis: number;
  kadroBoyutu: number;
}): SiraliOyuncu[] {
  const aktif = girisler.filter((g) => g.cikisZamani === null);

  const hesaplanmis = aktif.map((g) => ({
    giris: g,
    efektifZaman: Math.max(anketAcilis, g.girisZamani + g.ofsetSn * 1000),
  }));

  hesaplanmis.sort((a, b) => {
    const katmanFarki = KATMAN_SIRASI[a.giris.tip] - KATMAN_SIRASI[b.giris.tip];
    if (katmanFarki !== 0) return katmanFarki;

    if (a.giris.tip === 'vip') {
      const vipSiraFarki = (a.giris.vipSira ?? Number.MAX_SAFE_INTEGER)
                          - (b.giris.vipSira ?? Number.MAX_SAFE_INTEGER);
      if (vipSiraFarki !== 0) return vipSiraFarki;
    } else {
      const zamanFarki = a.efektifZaman - b.efektifZaman;
      if (zamanFarki !== 0) return zamanFarki;
    }

    const girisFarki = a.giris.girisZamani - b.giris.girisZamani;
    if (girisFarki !== 0) return girisFarki;

    return a.giris.oyuncuId.localeCompare(b.giris.oyuncuId);
  });

  return hesaplanmis.map((h, i) => ({
    oyuncuId: h.giris.oyuncuId,
    tip: h.giris.tip,
    sira: i + 1,
    konum: i < kadroBoyutu ? 'kadro' : 'yedek',
    efektifZaman: h.efektifZaman,
  }));
}
