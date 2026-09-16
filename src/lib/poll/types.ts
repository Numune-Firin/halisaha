export type Mevki = 'kaleci' | 'defans' | 'orta_saha' | 'forvet';

export type GirisTipi = 'vip' | 'oncelikli' | 'normal';

/** Bir oyuncunun tek bir maca ait anket giris kaydi. Zamanlar epoch milisaniye. */
export interface AnketGirisi {
  oyuncuId: string;
  tip: GirisTipi;
  /** Sunucu saatiyle yazilan gercek giris zamani */
  girisZamani: number;
  /** Uygulanan toplam ofset. Pozitif ceza, negatif odul. */
  ofsetSn: number;
  /** Yalnizca tip === 'vip' icin dolu: admin'in verdigi sira */
  vipSira: number | null;
  /** Dolu ise oyuncu anketten cikmistir, listede yer almaz */
  cikisZamani: number | null;
}

export interface SiraliOyuncu {
  oyuncuId: string;
  tip: GirisTipi;
  /** 1'den baslar */
  sira: number;
  konum: 'kadro' | 'yedek';
  efektifZaman: number;
}
