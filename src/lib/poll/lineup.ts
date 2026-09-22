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

/* --------------------------------------------------------------------------
   Taktikler
   -------------------------------------------------------------------------- */

/**
 * Hazir dizilişler. Sayilar kaleci haricdir: "3-2-1" demek uc defans, iki
 * orta, bir forvet demektir. Hangi taktigin secilebilecegi sahadaki oyuncu
 * sayisina baglidir.
 */
const FORMATIONS: Record<number, string[]> = {
  3: ['2-1', '1-2', '1-1-1'],
  4: ['2-1-1', '1-2-1', '2-2', '1-1-2'],
  5: ['2-2-1', '3-1-1', '2-1-2', '1-3-1', '3-2'],
  6: ['3-2-1', '2-3-1', '3-1-2', '2-2-2', '1-3-2', '3-3'],
  7: ['3-3-1', '3-2-2', '4-2-1', '2-3-2', '3-1-3'],
  8: ['4-3-1', '3-3-2', '4-2-2', '3-4-1'],
  9: ['4-3-2', '4-4-1', '3-4-2', '5-3-1'],
};

/**
 * Takimda kac kisi varsa ona uyan taktikler. Kaleci mevkili bir oyuncu varsa
 * kaleye gecer, taktik geri kalani boler; yoksa herkes hatlara dagilir.
 */
export function formationsFor(playerCount: number, hasKeeper: boolean): string[] {
  const outfield = hasKeeper ? playerCount - 1 : playerCount;
  return FORMATIONS[outfield] ?? [];
}

/** "3-2-1" -> [3, 2, 1] */
export function parseFormation(formation: string): number[] {
  return formation
    .split('-')
    .map((part) => Number(part))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Bir takimi secilen taktige gore dizer. Hatlar kaleden ileriye dogru sirayla
 * yerlesir; ayni hattaki oyuncular genislige esit dagitilir.
 *
 * Oyuncular once mevkilerine gore siralanir (kaleci, defans, orta, forvet),
 * boylece "3-2-1" dendiginde defanslar arkada kalir.
 */
export function applyFormation(
  people: LineupPerson[],
  team: LineupTeam,
  formation: string,
  current: Record<string, LineupSpot>,
): Record<string, LineupSpot> {
  const members = people.filter((p) => current[p.id]?.team === team);
  const lines = parseFormation(formation);
  if (lines.length === 0 || members.length === 0) return current;

  const order: Record<string, number> = {
    goalkeeper: 0,
    defender: 1,
    midfielder: 2,
    forward: 3,
  };
  const sorted = [...members].sort(
    (a, b) => (order[a.position ?? 'midfielder'] ?? 2) - (order[b.position ?? 'midfielder'] ?? 2),
  );

  const next = { ...current };
  const place = (person: LineupPerson, depth: number, index: number, total: number) => {
    const y = team === 'black' ? 4 + depth * 42 : 96 - depth * 42;
    const x = total === 1 ? 50 : 12 + (76 * index) / (total - 1);
    next[person.id] = { team, x: round(x), y: round(y) };
  };

  const queue = [...sorted];
  const keeper = queue[0]?.position === 'goalkeeper' ? queue.shift() : undefined;
  if (keeper) place(keeper, LINE_DEPTH.goalkeeper, 0, 1);

  // Hatlar kaleden ileriye: tek hat varsa orta yerde, coksa esit araliklarla
  lines.forEach((size, lineIndex) => {
    const depth =
      lines.length === 1 ? 0.55 : 0.28 + (lineIndex * 0.56) / (lines.length - 1);
    for (let i = 0; i < size; i += 1) {
      const person = queue.shift();
      if (!person) return;
      place(person, depth, i, size);
    }
  });

  // Taktige sigmayan kalanlar en one dizilir; kimse sahada kaybolmasin
  queue.forEach((person, index) => place(person, 0.92, index, Math.max(queue.length, 1)));

  return next;
}

/**
 * Takimlar denk mi? Tek sayili kadroda esitlik mumkun olmadigi icin bir
 * kisilik fark kabul edilir; iki ve uzeri fark kaydedilemez.
 *
 * Ayni kural veritabaninda da var (set_squad_lineup, save_squad_proposal).
 */
export function isEvenSplit(blackCount: number, whiteCount: number): boolean {
  if (blackCount + whiteCount === 0) return true;
  return Math.abs(blackCount - whiteCount) <= 1;
}
