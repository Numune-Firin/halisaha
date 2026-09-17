import { describe, expect, it } from 'vitest';
import { computeStandings, type StandingsAppearance, type StandingsMatch } from './table';

const matches: StandingsMatch[] = [
  { id: 'm1', blackScore: 3, whiteScore: 1 },
  { id: 'm2', blackScore: 2, whiteScore: 2 },
];

function appearance(
  matchId: string,
  participantId: string,
  team: 'black' | 'white' | null,
  fullName = participantId,
  isGuest = false,
): StandingsAppearance {
  return { matchId, participantId, fullName, isGuest, team };
}

describe('computeStandings', () => {
  it('galibiyete 3, beraberlige 1, maglubiyete 0 puan yazar', () => {
    const rows = computeStandings(matches, [
      appearance('m1', 'kazanan', 'black'),
      appearance('m1', 'kaybeden', 'white'),
      appearance('m2', 'berabere', 'black'),
    ]);

    expect(rows.map((r) => [r.participantId, r.points])).toEqual([
      ['kazanan', 3],
      ['berabere', 1],
      ['kaybeden', 0],
    ]);
  });

  it('ayni oyuncunun birden fazla macini toplar', () => {
    const [row] = computeStandings(matches, [
      appearance('m1', 'ali', 'black'),
      appearance('m2', 'ali', 'white'),
    ]);

    expect(row).toMatchObject({
      played: 2,
      won: 1,
      drawn: 1,
      lost: 0,
      goalsFor: 5,
      goalsAgainst: 3,
      goalDifference: 2,
      points: 4,
    });
  });

  it('takimi atanmamis kaydi ve skorsuz maci saymaz', () => {
    const rows = computeStandings(matches, [
      appearance('m1', 'takimsiz', null),
      appearance('skorsuz-mac', 'bekleyen', 'black'),
    ]);

    expect(rows).toEqual([]);
  });

  it('puan esitliginde once averaja, sonra atilan gole bakar', () => {
    const rows = computeStandings(
      [
        { id: 'a', blackScore: 5, whiteScore: 0 },
        { id: 'b', blackScore: 1, whiteScore: 0 },
        { id: 'c', blackScore: 3, whiteScore: 0 },
      ],
      [
        appearance('b', 'darAveraj', 'black'),
        appearance('a', 'genisAveraj', 'black'),
        // c: genisAveraj ile ayni averaj farki degil; ayrik bir oyuncu
        appearance('c', 'ortaAveraj', 'black'),
      ],
    );

    expect(rows.map((r) => r.participantId)).toEqual([
      'genisAveraj',
      'ortaAveraj',
      'darAveraj',
    ]);
  });

  it('her sey esitse Turkce alfabetik siralar', () => {
    const rows = computeStandings([{ id: 'm', blackScore: 1, whiteScore: 1 }], [
      appearance('m', '2', 'black', 'Zeki'),
      appearance('m', '1', 'white', 'Çetin'),
    ]);

    expect(rows.map((r) => r.fullName)).toEqual(['Çetin', 'Zeki']);
  });

  it('puan kazanma oranini alinabilecek puana gore hesaplar', () => {
    const rows = computeStandings(matches, [
      // Iki mac: biri galibiyet biri beraberlik -> 4 / 6
      appearance('m1', 'karisik', 'black'),
      appearance('m2', 'karisik', 'black'),
      // Tek mac, galibiyet -> 3 / 3
      appearance('m1', 'kusursuz', 'black', 'Kusursuz'),
      // Tek mac, maglubiyet -> 0 / 3
      appearance('m1', 'puansiz', 'white', 'Puansiz'),
    ]);

    const rate = (id: string) => rows.find((r) => r.participantId === id)?.pointsRate;

    expect(rate('kusursuz')).toBe(1);
    expect(rate('karisik')).toBeCloseTo(4 / 6, 5);
    expect(rate('puansiz')).toBe(0);
  });

  it('aday oyuncuyu da tabloya alir ve isaretini korur', () => {
    const [row] = computeStandings(matches, [
      appearance('m1', 'aday', 'black', 'Misafir Oyuncu', true),
    ]);

    expect(row.isGuest).toBe(true);
    expect(row.fullName).toBe('Misafir Oyuncu');
  });
});
