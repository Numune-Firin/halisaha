const SAAT_MS = 60 * 60 * 1000;

/**
 * Bir cikisin serbest pencere icinde mi yoksa gec mi oldugunu belirler.
 * Pencere mac saatinden geriye sayar: mac saatine `cikisPenceresiSaat` kala kapanir.
 * Sinir aninda yapilan cikis gec sayilir.
 */
export function cikisiDegerlendir({
  simdi,
  macZamani,
  cikisPenceresiSaat,
  gecCikisCezasiSn,
}: {
  simdi: number;
  macZamani: number;
  cikisPenceresiSaat: number;
  gecCikisCezasiSn: number;
}): { gecCikis: boolean; cezaSn: number } {
  const pencereKapanis = macZamani - cikisPenceresiSaat * SAAT_MS;
  const gecCikis = simdi >= pencereKapanis;

  return { gecCikis, cezaSn: gecCikis ? gecCikisCezasiSn : 0 };
}
