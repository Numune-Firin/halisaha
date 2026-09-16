/** Henuz hicbir ankette kullanilmamis ceza/odul kaydi. Pozitif ceza, negatif odul. */
export interface PendingOffset {
  id: string;
  playerId: string;
  seconds: number;
}

/** Bekleyen tum ceza ve odulleri tek bir ofset degerine indirger. */
export function sumOffsets(pending: PendingOffset[]): number {
  return pending.reduce((total, p) => total + p.seconds, 0);
}

/**
 * Ankete girisle birlikte tuketilecek kayitlarin id'leri.
 * Net ofset sifir cikmis olsa bile tum kayitlar tuketilir; devretmezler.
 */
export function consumableIds(pending: PendingOffset[]): string[] {
  return pending.map((p) => p.id);
}
