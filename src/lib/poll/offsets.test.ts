import { describe, it, expect } from 'vitest';
import { sumOffsets, consumableIds } from './offsets';
import type { PendingOffset } from './offsets';

const of = (id: string, seconds: number): PendingOffset => ({
  id,
  playerId: 'player-1',
  seconds,
});

describe('sumOffsets', () => {
  it('bekleyen yoksa sifir doner', () => {
    expect(sumOffsets([])).toBe(0);
  });

  it('tek cezayi aynen doner', () => {
    expect(sumOffsets([of('a', 8)])).toBe(8);
  });

  it('birden fazla cezayi toplar', () => {
    expect(sumOffsets([of('a', 8), of('b', 10)])).toBe(18);
  });

  it('ceza ve odulu birbirine mahsup eder', () => {
    expect(sumOffsets([of('a', 8), of('b', -10)])).toBe(-2);
  });

  it('tam mahsupta sifir doner', () => {
    expect(sumOffsets([of('a', 10), of('b', -10)])).toBe(0);
  });
});

describe('consumableIds', () => {
  it('bekleyen yoksa bos dizi doner', () => {
    expect(consumableIds([])).toEqual([]);
  });

  it('net ofset sifir olsa bile tum bekleyenleri tuketir', () => {
    // Ceza ve odul birbirini goturse de ikisi de kullanilmis sayilir,
    // bir sonraki ankete devretmez.
    expect(consumableIds([of('a', 10), of('b', -10)])).toEqual(['a', 'b']);
  });

  it('bekleyen tum kayitlarin kimliklerini doner', () => {
    expect(consumableIds([of('a', 8), of('b', -3), of('c', 5)]))
      .toEqual(['a', 'b', 'c']);
  });
});
