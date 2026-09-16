export type Position = 'goalkeeper' | 'defender' | 'midfielder' | 'forward';

export type EntryType = 'vip' | 'priority' | 'standard';

/** Bir oyuncunun tek bir maca ait anket giris kaydi. Zamanlar epoch milisaniye. */
export interface PollEntry {
  playerId: string;
  entryType: EntryType;
  /** Sunucu saatiyle yazilan gercek giris zamani */
  enteredAt: number;
  /** Uygulanan toplam ofset. Pozitif ceza, negatif odul. */
  offsetSeconds: number;
  /** Yalnizca entryType === 'vip' icin dolu: admin'in verdigi sira */
  vipRank: number | null;
  /** Dolu ise oyuncu anketten cikmistir, listede yer almaz */
  withdrawnAt: number | null;
}

export interface RankedPlayer {
  playerId: string;
  entryType: EntryType;
  /** 1'den baslar */
  rank: number;
  placement: 'squad' | 'reserve';
  effectiveTime: number;
}
