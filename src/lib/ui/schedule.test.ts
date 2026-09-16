import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextOccurrences } from './schedule';

/** Turkiye saatiyle verilen bir ani sistem saati yapar (UTC+3, yaz saati yok). */
function setNow(istanbulIso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${istanbulIso}+03:00`));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('nextOccurrences', () => {
  it('haftanin ilerisindeki ilk gunu bulur', () => {
    // 16 Eylul 2026 Carsamba
    setNow('2026-09-16T09:00:00');
    expect(nextOccurrences(1, '12:00', 1)).toEqual(['2026-09-21T09:00:00.000Z']);
  });

  it('bugun o gunse ve saat gelmediyse bugunu verir', () => {
    // 21 Eylul 2026 Pazartesi, saat 09:00
    setNow('2026-09-21T09:00:00');
    expect(nextOccurrences(1, '12:00', 1)).toEqual(['2026-09-21T09:00:00.000Z']);
  });

  it('bugun o gunse ama saat gectiyse haftaya atlar', () => {
    setNow('2026-09-21T13:00:00');
    expect(nextOccurrences(1, '12:00', 1)).toEqual(['2026-09-28T09:00:00.000Z']);
  });

  it('istenen sayida ve yedi gun arayla uretir', () => {
    setNow('2026-09-16T09:00:00');
    expect(nextOccurrences(1, '12:00', 3)).toEqual([
      '2026-09-21T09:00:00.000Z',
      '2026-09-28T09:00:00.000Z',
      '2026-10-05T09:00:00.000Z',
    ]);
  });

  it('saniyeli saat bicimini de kabul eder', () => {
    setNow('2026-09-16T09:00:00');
    expect(nextOccurrences(6, '20:30:00', 1)).toEqual(['2026-09-19T17:30:00.000Z']);
  });
});
