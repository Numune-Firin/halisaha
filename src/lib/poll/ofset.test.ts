import { describe, it, expect } from 'vitest';
import { toplamOfset, tuketilecekIdler } from './ofset';
import type { BekleyenOfset } from './ofset';

const of = (id: string, saniye: number): BekleyenOfset => ({
  id,
  oyuncuId: 'oyuncu-1',
  saniye,
});

describe('toplamOfset', () => {
  it('bekleyen yoksa sifir doner', () => {
    expect(toplamOfset([])).toBe(0);
  });

  it('tek cezayi aynen doner', () => {
    expect(toplamOfset([of('a', 8)])).toBe(8);
  });

  it('birden fazla cezayi toplar', () => {
    expect(toplamOfset([of('a', 8), of('b', 10)])).toBe(18);
  });

  it('ceza ve odulu birbirine mahsup eder', () => {
    expect(toplamOfset([of('a', 8), of('b', -10)])).toBe(-2);
  });

  it('tam mahsupta sifir doner', () => {
    expect(toplamOfset([of('a', 10), of('b', -10)])).toBe(0);
  });
});

describe('tuketilecekIdler', () => {
  it('bekleyen yoksa bos dizi doner', () => {
    expect(tuketilecekIdler([])).toEqual([]);
  });

  it('net ofset sifir olsa bile tum bekleyenleri tuketir', () => {
    // Ceza ve odul birbirini goturse de ikisi de kullanilmis sayilir,
    // bir sonraki ankete devretmez.
    expect(tuketilecekIdler([of('a', 10), of('b', -10)])).toEqual(['a', 'b']);
  });

  it('bekleyen tum kayitlarin kimliklerini doner', () => {
    expect(tuketilecekIdler([of('a', 8), of('b', -3), of('c', 5)]))
      .toEqual(['a', 'b', 'c']);
  });
});
