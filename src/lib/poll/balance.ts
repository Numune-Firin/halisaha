import type { Position } from '@/lib/poll/types';

/**
 * Yildiza gore dengeli takim onerisi.
 *
 * Amac iki takimin yildiz toplamini birbirine yaklastirmak. Sira sunlari
 * gozetir:
 *   1) Kaleciler once ve ayri dagitilir — iki kaleci varsa ikisi ayni takima
 *      dusmez, tek kaleci varsa bir tarafta kalir.
 *   2) Kalanlar yildizi yuksekten dusuge dogru, o an toplami dusuk olan
 *      takima yazilir. Kontenjan dolan takim atlanir, boylece kadro ikiye
 *      esit (tek sayida ise bir kisi farkla) bolunur.
 *
 * Hic oy almamis oyuncunun yildizi yoktur; kadronun ortalamasi varsayilir,
 * o da yoksa 3 (orta seviye) kabul edilir. Boyle bir oyuncu dengeyi tek
 * basina bozmaz.
 */

export interface BalanceInput {
  id: string;
  rating: number | null;
  position: Position | null;
}

export type BalanceTeam = 'black' | 'white';

const NEUTRAL_RATING = 3;

export function balanceTeams(squad: BalanceInput[]): Record<string, BalanceTeam> {
  const rated = squad.filter((m) => m.rating !== null);
  const fallback =
    rated.length > 0
      ? rated.reduce((sum, m) => sum + (m.rating as number), 0) / rated.length
      : NEUTRAL_RATING;

  const value = (m: BalanceInput) => m.rating ?? fallback;

  // Kontenjan: tek sayida kadroda bir takim bir fazla alir
  const capacity: Record<BalanceTeam, number> = {
    black: Math.ceil(squad.length / 2),
    white: Math.floor(squad.length / 2),
  };
  const total: Record<BalanceTeam, number> = { black: 0, white: 0 };
  const count: Record<BalanceTeam, number> = { black: 0, white: 0 };
  const result: Record<string, BalanceTeam> = {};

  function place(member: BalanceInput, preferred?: BalanceTeam) {
    const options: BalanceTeam[] = preferred
      ? [preferred, preferred === 'black' ? 'white' : 'black']
      : (['black', 'white'] as const)
          .slice()
          .sort((a, b) => total[a] - total[b] || count[a] - count[b]);

    const team = options.find((t) => count[t] < capacity[t]) ?? options[0];
    result[member.id] = team;
    total[team] += value(member);
    count[team] += 1;
  }

  const byRating = [...squad].sort((a, b) => value(b) - value(a));
  const keepers = byRating.filter((m) => m.position === 'goalkeeper');
  const others = byRating.filter((m) => m.position !== 'goalkeeper');

  // Kaleciler once: ilk ikisi karsilikli takimlara, varsa fazlasi dengeye gore
  keepers.forEach((keeper, index) => {
    if (index === 0) place(keeper, 'black');
    else if (index === 1) place(keeper, 'white');
    else place(keeper);
  });

  for (const member of others) place(member);

  improve(squad, result, total, value);

  return result;
}

/**
 * Sirayla dagitmak her zaman en iyi bolmeyi bulmaz. Burada iki takimdan birer
 * oyuncu degistirilerek fark kapanmaya calisilir; kadro on dort kisilik oldugu
 * icin bu denemeler anlik.
 *
 * Kaleci yalnizca kaleciyle yer degistirir, yoksa bir takim kalecisiz kalir.
 */
function improve(
  squad: BalanceInput[],
  result: Record<string, BalanceTeam>,
  total: Record<BalanceTeam, number>,
  value: (m: BalanceInput) => number,
) {
  const MAX_PASSES = 20;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const diff = total.black - total.white;
    if (Math.abs(diff) < 0.001) return;

    let best: { a: BalanceInput; b: BalanceInput; diff: number } | null = null;

    for (const a of squad.filter((m) => result[m.id] === 'black')) {
      for (const b of squad.filter((m) => result[m.id] === 'white')) {
        const sameKind =
          (a.position === 'goalkeeper') === (b.position === 'goalkeeper');
        if (!sameKind) continue;

        const after = Math.abs(diff - 2 * (value(a) - value(b)));
        if (after < Math.abs(diff) - 0.001 && (!best || after < Math.abs(best.diff))) {
          best = { a, b, diff: diff - 2 * (value(a) - value(b)) };
        }
      }
    }

    if (!best) return;

    result[best.a.id] = 'white';
    result[best.b.id] = 'black';
    total.black += value(best.b) - value(best.a);
    total.white += value(best.a) - value(best.b);
  }
}

/** Bir takimin yildiz toplami; onerinin ne kadar dengeli oldugunu gostermek icin. */
export function teamRating(members: { rating: number | null }[], fallback = NEUTRAL_RATING) {
  if (members.length === 0) return 0;
  return members.reduce((sum, m) => sum + (m.rating ?? fallback), 0);
}
