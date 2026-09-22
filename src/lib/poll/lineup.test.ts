import { describe, expect, it } from 'vitest';
import { arrangeLineup, clampToPitch, suggestLineup, teamForY } from './lineup';
import type { Position } from '@/lib/poll/types';

function person(id: string, position: Position | null = null, rating: number | null = null) {
  return { id, position, rating };
}

describe('teamForY', () => {
  it('ust yariyi siyaha, alt yariyi beyaza verir', () => {
    expect(teamForY(10)).toBe('black');
    expect(teamForY(49.9)).toBe('black');
    expect(teamForY(50)).toBe('white');
    expect(teamForY(90)).toBe('white');
  });
});

describe('arrangeLineup', () => {
  it('herkesi kendi yarisina koyar', () => {
    const people = [person('a'), person('b'), person('c'), person('d')];
    const spots = arrangeLineup(people, { a: 'black', b: 'black', c: 'white', d: 'white' });

    expect(spots.a.y).toBeLessThan(50);
    expect(spots.b.y).toBeLessThan(50);
    expect(spots.c.y).toBeGreaterThanOrEqual(50);
    expect(spots.d.y).toBeGreaterThanOrEqual(50);
  });

  it('kaleciyi kalesine en yakin hatta dizer', () => {
    const people = [person('k', 'goalkeeper'), person('f', 'forward')];
    const spots = arrangeLineup(people, { k: 'black', f: 'black' });

    // Ust yarida kale yukaridadir: kaleci forvetten daha kucuk y degerinde
    expect(spots.k.y).toBeLessThan(spots.f.y);
  });

  it('alt yarida hatlari aynalar', () => {
    const people = [person('k', 'goalkeeper'), person('f', 'forward')];
    const spots = arrangeLineup(people, { k: 'white', f: 'white' });

    // Alt yarida kale asagidadir: kaleci forvetten daha buyuk y degerinde
    expect(spots.k.y).toBeGreaterThan(spots.f.y);
  });

  it('ayni hattaki oyunculari yan yana dagitir', () => {
    const people = [person('a', 'defender'), person('b', 'defender'), person('c', 'defender')];
    const spots = arrangeLineup(people, { a: 'black', b: 'black', c: 'black' });

    const xs = [spots.a.x, spots.b.x, spots.c.x].sort((p, q) => p - q);
    expect(new Set(xs).size).toBe(3);
    expect(xs[0]).toBeGreaterThanOrEqual(4);
    expect(xs[2]).toBeLessThanOrEqual(96);
  });

  it('tek kisilik hatti ortaya koyar', () => {
    const spots = arrangeLineup([person('a', 'forward')], { a: 'black' });
    expect(spots.a.x).toBe(50);
  });

  it('takimi olmayani sahaya koymaz', () => {
    const spots = arrangeLineup([person('a'), person('b')], { a: 'black' });
    expect(spots.b).toBeUndefined();
  });
});

describe('suggestLineup', () => {
  it('kadroyu ikiye bolup sahaya dizer', () => {
    const people = Array.from({ length: 14 }, (_, i) => person(`p${i}`, null, 3));
    const spots = suggestLineup(people);

    expect(Object.keys(spots)).toHaveLength(14);
    const black = Object.values(spots).filter((s) => s.team === 'black');
    expect(black).toHaveLength(7);
  });
});

describe('clampToPitch', () => {
  it('sahanin disina tasmaz', () => {
    expect(clampToPitch(-20)).toBe(4);
    expect(clampToPitch(140)).toBe(96);
    expect(clampToPitch(50)).toBe(50);
  });
});
