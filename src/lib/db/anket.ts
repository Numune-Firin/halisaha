import { sunucuIstemcisi } from '@/lib/supabase/server';
import { anketiSirala } from '@/lib/poll/sirala';
import type { AnketGirisi, GirisTipi, Mevki } from '@/lib/poll/types';

export interface MacOzet {
  id: string;
  macZamani: string;
  saha: string;
  durum: 'anket_acik' | 'kadro_kesin' | 'oynandi' | 'tamamlandi';
  kadroBoyutu: number;
  anketAcilis: string;
  cikisPenceresiSaat: number;
  gecCikisCezasiSn: number;
}

export interface AnketSatiri {
  oyuncuId: string;
  ad: string;
  mevki: Mevki | null;
  tip: GirisTipi;
  sira: number;
  konum: 'kadro' | 'yedek';
}

/** Bir macin anket listesini sunucuda hesaplayip sirali dondurur. */
export async function anketiGetir(
  macId: string,
): Promise<{ mac: MacOzet; satirlar: AnketSatiri[] } | null> {
  const supabase = await sunucuIstemcisi();

  const { data: macRow } = await supabase
    .from('matches')
    .select('id, mac_zamani, saha, durum, kadro_boyutu, anket_acilis, cikis_penceresi_saat, gec_cikis_cezasi_sn')
    .eq('id', macId)
    .single();

  if (!macRow) return null;

  const { data: girisRows } = await supabase
    .from('match_entries')
    .select('oyuncu_id, tip, giris_zamani, ofset_sn, vip_sira, cikis_zamani, profiles(ad, mevki)')
    .eq('mac_id', macId);

  const rows = girisRows ?? [];

  const girisler: AnketGirisi[] = rows.map((r) => ({
    oyuncuId: r.oyuncu_id as string,
    tip: r.tip as GirisTipi,
    girisZamani: new Date(r.giris_zamani as string).getTime(),
    ofsetSn: r.ofset_sn as number,
    vipSira: r.vip_sira as number | null,
    cikisZamani: r.cikis_zamani ? new Date(r.cikis_zamani as string).getTime() : null,
  }));

  const sirali = anketiSirala({
    girisler,
    anketAcilis: new Date(macRow.anket_acilis as string).getTime(),
    kadroBoyutu: macRow.kadro_boyutu as number,
  });

  const profilAd = new Map<string, { ad: string; mevki: Mevki | null }>(
    rows.map((r) => {
      const p = r.profiles as unknown as { ad: string; mevki: Mevki | null };
      return [r.oyuncu_id as string, { ad: p?.ad ?? '', mevki: p?.mevki ?? null }];
    }),
  );

  return {
    mac: {
      id: macRow.id as string,
      macZamani: macRow.mac_zamani as string,
      saha: macRow.saha as string,
      durum: macRow.durum as MacOzet['durum'],
      kadroBoyutu: macRow.kadro_boyutu as number,
      anketAcilis: macRow.anket_acilis as string,
      cikisPenceresiSaat: macRow.cikis_penceresi_saat as number,
      gecCikisCezasiSn: macRow.gec_cikis_cezasi_sn as number,
    },
    satirlar: sirali.map((s) => ({
      oyuncuId: s.oyuncuId,
      ad: profilAd.get(s.oyuncuId)?.ad ?? '',
      mevki: profilAd.get(s.oyuncuId)?.mevki ?? null,
      tip: s.tip,
      sira: s.sira,
      konum: s.konum,
    })),
  };
}
