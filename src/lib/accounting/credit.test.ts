import { describe, expect, it } from 'vitest';
import { summarizeAccounts, totalCredit, totalDebt, type CreditEvent } from './credit';

/**
 * Olay uretici. Veritabanindaki player_ledger ne donuyorsa onu taklit eder:
 * balanceBefore/due/balanceAfter orada hesaplanir, burada elle verilir.
 */
function week(over: Partial<CreditEvent> & { fullName: string; balanceAfter: number }): CreditEvent {
  return {
    personId: over.fullName,
    isGuest: false,
    occurredAt: '2026-09-22T19:00:00Z',
    kind: 'match',
    matchId: 'm1',
    squadId: 's1',
    matchStatus: 'played',
    category: null,
    note: '',
    charged: 600,
    paid: 600,
    balanceBefore: 0,
    due: 600,
    ...over,
  };
}

describe('summarizeAccounts', () => {
  it('fazla odeyen oyuncu alacakli cikar', () => {
    const [ali] = summarizeAccounts([
      week({ fullName: 'Ali', paid: 1700, balanceBefore: 0, due: 600, balanceAfter: 1100 }),
    ]);
    expect(ali.balance).toBe(1100);
    expect(ali.paid).toBe(1700);
    expect(ali.charged).toBe(600);
  });

  it('alacaktan dusulen haftalari sayar', () => {
    // 1700 odedi, sonraki iki hafta alacagindan dustu
    const [ali] = summarizeAccounts([
      week({ fullName: 'Ali', occurredAt: '2026-09-22T19:00:00Z', paid: 1700, due: 600, balanceAfter: 1100 }),
      week({ fullName: 'Ali', occurredAt: '2026-09-29T19:00:00Z', matchId: 'm2', paid: 0, balanceBefore: 1100, due: 0, balanceAfter: 500 }),
      week({ fullName: 'Ali', occurredAt: '2026-10-06T19:00:00Z', matchId: 'm3', paid: 100, balanceBefore: 500, due: 100, balanceAfter: 0 }),
    ]);
    expect(ali.balance).toBe(0);
    expect(ali.matchCount).toBe(3);
    // Ilk hafta 0, ikinci hafta 600, ucuncu hafta 500 alacaktan karsilandi
    expect(ali.creditUsed).toBe(1100);
    expect(ali.paid).toBe(1800);
  });

  it('bagisa cevrilen tutari ayri tutar', () => {
    const [ali] = summarizeAccounts([
      week({ fullName: 'Ali', paid: 1700, due: 600, balanceAfter: 1100 }),
      {
        personId: 'Ali',
        isGuest: false,
        fullName: 'Ali',
        occurredAt: '2026-09-23T10:00:00Z',
        kind: 'conversion',
        matchId: null,
        squadId: null,
        matchStatus: null,
        category: 'refreshment',
        note: 'İkram olsun',
        charged: 800,
        paid: 0,
        balanceBefore: 1100,
        due: 800,
        balanceAfter: 300,
      },
    ]);
    expect(ali.donated).toBe(800);
    expect(ali.balance).toBe(300);
    // Cevirme bir hafta degildir, mac sayisina girmez
    expect(ali.matchCount).toBe(1);
  });

  it('eksik odeyenin borcu sonraki haftanin ucretine eklenir', () => {
    // 600'luk haftaya 200 odedi, 400 borclu kaldi; ertesi hafta 1.000 bekleniyor
    const [ali] = summarizeAccounts([
      week({ fullName: 'Ali', paid: 200, due: 600, balanceAfter: -400 }),
      week({
        fullName: 'Ali',
        occurredAt: '2026-09-29T19:00:00Z',
        matchId: 'm2',
        paid: 1000,
        balanceBefore: -400,
        due: 1000,
        balanceAfter: 0,
      }),
    ]);
    expect(ali.balance).toBe(0);
    expect(ali.debtCarried).toBe(400);
    expect(ali.creditUsed).toBe(0);
  });

  it('hic odemeyen borclu gorunur', () => {
    const [ali] = summarizeAccounts([
      week({ fullName: 'Ali', paid: 0, due: 600, balanceAfter: -600 }),
    ]);
    expect(ali.balance).toBe(-600);
    expect(ali.paid).toBe(0);
  });

  it('iptal edilen haftada odenen para alacaga doner', () => {
    const [ali] = summarizeAccounts([
      week({
        fullName: 'Ali',
        matchStatus: 'cancelled',
        charged: 0,
        paid: 600,
        due: 0,
        balanceAfter: 600,
      }),
    ]);
    expect(ali.balance).toBe(600);
    expect(ali.charged).toBe(0);
  });

  it('alacaklilari basa, borclulari sona koyar', () => {
    const accounts = summarizeAccounts([
      week({ fullName: 'Borclu', paid: 0, due: 600, balanceAfter: -600 }),
      week({ fullName: 'Alacakli', paid: 1200, due: 600, balanceAfter: 600 }),
      week({ fullName: 'Temiz', paid: 600, due: 600, balanceAfter: 0 }),
    ]);
    expect(accounts.map((a) => a.fullName)).toEqual(['Alacakli', 'Temiz', 'Borclu']);
  });

  it('toplam alacak ve borcu ayri ayri toplar', () => {
    const accounts = summarizeAccounts([
      week({ fullName: 'A', paid: 1200, due: 600, balanceAfter: 600 }),
      week({ fullName: 'B', paid: 0, due: 600, balanceAfter: -600 }),
      week({ fullName: 'C', paid: 900, due: 600, balanceAfter: 300 }),
    ]);
    expect(totalCredit(accounts)).toBe(900);
    expect(totalDebt(accounts)).toBe(600);
  });

  it('olay yoksa bos liste doner', () => {
    expect(summarizeAccounts([])).toEqual([]);
  });
});
