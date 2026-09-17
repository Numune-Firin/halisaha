/**
 * Puan durumu, oynanmis maclarin skorlarindan ve kadro takim dagilimindan
 * turetilir; ayri bir puan tablosu tutulmaz. Skor duzeltilince siralama da
 * kendiliginden duzelir.
 *
 * Puanlama: galibiyet 3, beraberlik 1, maglubiyet 0.
 */
export type Team = 'black' | 'white';

export type StandingsMatch = {
  id: string;
  blackScore: number;
  whiteScore: number;
};

/** Bir oyuncunun bir mactaki yeri. Takimi atanmamis oyuncu hesaba katilmaz. */
export type StandingsAppearance = {
  matchId: string;
  participantId: string;
  fullName: string;
  isGuest: boolean;
  team: Team | null;
};

export type StandingRow = {
  participantId: string;
  fullName: string;
  isGuest: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /**
   * Alinabilecek puanin yuzde kaci alindi: points / (played * 3).
   * Az mac oynayanla cok mac oynayani ayni olcekte karsilastirmak icin.
   */
  pointsRate: number;
};

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

export function computeStandings(
  matches: StandingsMatch[],
  appearances: StandingsAppearance[],
): StandingRow[] {
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const table = new Map<string, StandingRow>();

  for (const a of appearances) {
    const match = a.team ? matchById.get(a.matchId) : undefined;
    // Skoru girilmemis ya da takimi atanmamis kayitlar puana islemez
    if (!match) continue;

    let row = table.get(a.participantId);
    if (!row) {
      row = {
        participantId: a.participantId,
        fullName: a.fullName,
        isGuest: a.isGuest,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        pointsRate: 0,
      };
      table.set(a.participantId, row);
    }

    const scored = a.team === 'black' ? match.blackScore : match.whiteScore;
    const conceded = a.team === 'black' ? match.whiteScore : match.blackScore;

    row.played += 1;
    row.goalsFor += scored;
    row.goalsAgainst += conceded;

    if (scored > conceded) {
      row.won += 1;
      row.points += WIN_POINTS;
    } else if (scored === conceded) {
      row.drawn += 1;
      row.points += DRAW_POINTS;
    } else {
      row.lost += 1;
    }
  }

  for (const row of table.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    row.pointsRate = row.played > 0 ? row.points / (row.played * WIN_POINTS) : 0;
  }

  // Puan, averaj, atilan gol; hepsi esitse ada gore alfabetik (Turkce siralama)
  return [...table.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.fullName.localeCompare(b.fullName, 'tr'),
  );
}
