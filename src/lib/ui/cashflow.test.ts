import { describe, expect, it } from 'vitest';
import { dayKey, groupByDay, type CashMovement } from './cashflow';

function movement(over: Partial<CashMovement> & { id: string; day: string }): CashMovement {
  return {
    kind: 'ledger',
    direction: 'income',
    amount: 100,
    label: 'Bağış',
    detail: '',
    matchId: null,
    at: null,
    ...over,
  };
}

describe('dayKey', () => {
  it('tarih kolonunu oldugu gibi birakir', () => {
    expect(dayKey('2026-09-20')).toBe('2026-09-20');
  });

  it('ani Turkiye gunune cevirir', () => {
    // 22:30 UTC, Turkiye'de ertesi gun 01:30
    expect(dayKey('2026-09-20T22:30:00Z')).toBe('2026-09-21');
  });
});

describe('groupByDay', () => {
  it('gunleri yeniden eskiye siralar', () => {
    const days = groupByDay([
      movement({ id: 'a', day: '2026-09-15' }),
      movement({ id: 'b', day: '2026-09-22' }),
      movement({ id: 'c', day: '2026-09-18' }),
    ]);
    expect(days.map((d) => d.day)).toEqual(['2026-09-22', '2026-09-18', '2026-09-15']);
  });

  it('gunun gelir, gider ve netini hesaplar', () => {
    const [day] = groupByDay([
      movement({ id: 'a', day: '2026-09-22', direction: 'income', amount: 700 }),
      movement({ id: 'b', day: '2026-09-22', direction: 'expense', amount: 900 }),
      movement({ id: 'c', day: '2026-09-22', direction: 'income', amount: 50 }),
    ]);
    expect(day.income).toBe(750);
    expect(day.expense).toBe(900);
    expect(day.net).toBe(-150);
  });

  it('gun icinde ani bilinenleri yeniden eskiye, bilinmeyenleri sona koyar', () => {
    const [day] = groupByDay([
      movement({ id: 'tarihsiz', day: '2026-09-22' }),
      movement({ id: 'erken', day: '2026-09-22', at: '2026-09-22T08:00:00Z' }),
      movement({ id: 'gec', day: '2026-09-22', at: '2026-09-22T19:00:00Z' }),
    ]);
    expect(day.movements.map((m) => m.id)).toEqual(['gec', 'erken', 'tarihsiz']);
  });

  it('iptal edilmis kayit ve ters fisi birbirini goturur ama listede kalir', () => {
    const [day] = groupByDay([
      movement({ id: 'asil', day: '2026-09-22', direction: 'expense', amount: 900, reversedAt: '2026-09-23T10:00:00Z' }),
      movement({ id: 'ters', day: '2026-09-22', direction: 'income', amount: 900, reversesId: 'asil' }),
    ]);
    expect(day.net).toBe(0);
    expect(day.movements).toHaveLength(2);
  });

  it('bos liste bos doner', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
