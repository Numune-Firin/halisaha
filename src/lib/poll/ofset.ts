/** Henuz hicbir ankette kullanilmamis ceza/odul kaydi. Pozitif ceza, negatif odul. */
export interface BekleyenOfset {
  id: string;
  oyuncuId: string;
  saniye: number;
}

/** Bekleyen tum ceza ve odulleri tek bir ofset degerine indirger. */
export function toplamOfset(bekleyenler: BekleyenOfset[]): number {
  return bekleyenler.reduce((toplam, o) => toplam + o.saniye, 0);
}

/**
 * Ankete girisle birlikte tuketilecek kayitlarin id'leri.
 * Net ofset sifir cikmis olsa bile tum kayitlar tuketilir; devretmezler.
 */
export function tuketilecekIdler(bekleyenler: BekleyenOfset[]): string[] {
  return bekleyenler.map((o) => o.id);
}
