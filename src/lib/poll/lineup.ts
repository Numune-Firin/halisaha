import type { Position } from '@/lib/poll/types';
import { balanceTeams } from '@/lib/poll/balance';

/**
 * Saha uzerindeki diziliş.
 *
 * Konum, sahanin yuzdesidir: x soldan (0-100), y yukaridan (0-100). Ust yari
 * bir takim, alt yari digeri; boylece oyuncuyu karsi yariya surukleyen kisi
 * onu karsi takima gecirmis olur.
 *
 * Hatlar mevkiye gore dizilir: kaleci kalede, defans arkada, orta sahada,
 * forvet ileride. Ayni hattaki oyuncular genislige esit dagitilir.
 */

export type LineupTeam = 'black' | 'white';

export interface LineupSpot {
  team: LineupTeam;
  x: number;
  y: number;
}

export interface LineupPerson {
  id: string;
  position: Position | null;
  rating: number | null;
}

/** Ust yari black, alt yari white. Sinir tam ortadir. */
export function teamForY(y: number): LineupTeam {
  return y < 50 ? 'black' : 'white';
}

/** Hattin kendi yarisindaki derinligi: 0 kaleye en yakin, 1 orta sahaya. */
const LINE_DEPTH: Record<string, number> = {
  goalkeeper: 0.08,
  defender: 0.32,
  midfielder: 0.58,
  forward: 0.84,
};

function lineOf(position: Position | null): keyof typeof LINE_DEPTH {
  if (position === 'goalkeeper') return 'goalkeeper';
  if (position === 'defender') return 'defender';
  if (position === 'forward') return 'forward';
  return 'midfielder';
}

/**
 * Takimi belli olan oyunculari kendi yarisina mevkilerine gore dizer.
 * Konumu zaten olanlar da yeniden dizilir: "Otomatik diz" dugmesi bunu kullanir.
 */
export function arrangeLineup(
  people: LineupPerson[],
  teams: Record<string, LineupTeam>,
): Record<string, LineupSpot> {
  const result: Record<string, LineupSpot> = {};

  for (const team of ['black', 'white'] as const) {
    const members = people.filter((p) => teams[p.id] === team);

    const byLine = new Map<string, LineupPerson[]>();
    for (const person of members) {
      const line = lineOf(person.position);
      byLine.set(line, [...(byLine.get(line) ?? []), person]);
    }

    for (const [line, group] of byLine) {
      const depth = LINE_DEPTH[line];
      // Ust yari yukaridan asagi, alt yari asagidan yukari acilir
      const y = team === 'black' ? 4 + depth * 42 : 96 - depth * 42;

      group.forEach((person, index) => {
        // Kenarlarda bosluk kalsin diye 12-88 arasina yayilir
        const x =
          group.length === 1 ? 50 : 12 + (76 * index) / (group.length - 1);
        result[person.id] = { team, x: round(x), y: round(y) };
      });
    }
  }

  return result;
}

/** Yildizlara gore dengeli takimlar kurar ve ikisini de sahaya dizer. */
export function suggestLineup(people: LineupPerson[]): Record<string, LineupSpot> {
  const teams = balanceTeams(
    people.map((p) => ({ id: p.id, rating: p.rating, position: p.position })),
  );
  return arrangeLineup(people, teams);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Konumu sahanin icinde tutar; jeton yarisi disari tasmasin. */
export function clampToPitch(value: number) {
  return Math.min(96, Math.max(4, round(value)));
}
