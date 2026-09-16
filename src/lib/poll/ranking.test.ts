import { describe, it, expect } from 'vitest';
import { rankPollEntries } from './ranking';
import type { PollEntry } from './types';

const OPENED_AT = 1_000_000_000_000; // sabit anket acilis zamani
const SEC = 1000;

function entry(over: Partial<PollEntry> & { playerId: string }): PollEntry {
  return {
    entryType: 'standard',
    enteredAt: OPENED_AT,
    offsetSeconds: 0,
    vipRank: null,
    withdrawnAt: null,
    ...over,
  };
}

function rank(entries: PollEntry[], squadSize = 14) {
  return rankPollEntries({ entries, pollOpenedAt: OPENED_AT, squadSize });
}

describe('rankPollEntries', () => {
  it('bos listede bos dizi doner', () => {
    expect(rank([])).toEqual([]);
  });

  it('normal oyunculari giris sirasina gore dizer', () => {
    const result = rank([
      entry({ playerId: 'c', enteredAt: OPENED_AT + 30 * SEC }),
      entry({ playerId: 'a', enteredAt: OPENED_AT + 10 * SEC }),
      entry({ playerId: 'b', enteredAt: OPENED_AT + 20 * SEC }),
    ]);
    expect(result.map((p) => p.playerId)).toEqual(['a', 'b', 'c']);
    expect(result.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it('ceza oyuncuyu geriye atar', () => {
    // a once girdi ama +10sn cezali; b 6 saniye sonra girdi, cezasiz.
    // a'nin efektif zamani ACILIS+20sn, b'ninki ACILIS+16sn -> b one gecer.
    const result = rank([
      entry({ playerId: 'a', enteredAt: OPENED_AT + 10 * SEC, offsetSeconds: 10 }),
      entry({ playerId: 'b', enteredAt: OPENED_AT + 16 * SEC }),
    ]);
    expect(result.map((p) => p.playerId)).toEqual(['b', 'a']);
  });

  it('odul oyuncuyu one ceker', () => {
    const result = rank([
      entry({ playerId: 'a', enteredAt: OPENED_AT + 30 * SEC }),
      entry({ playerId: 'b', enteredAt: OPENED_AT + 40 * SEC, offsetSeconds: -20 }),
    ]);
    expect(result.map((p) => p.playerId)).toEqual(['b', 'a']);
  });

  it('odul efektif zamani anket acilisinin oncesine tasimaz', () => {
    const result = rank([
      entry({ playerId: 'a', enteredAt: OPENED_AT + 5 * SEC, offsetSeconds: -600 }),
    ]);
    expect(result[0].effectiveTime).toBe(OPENED_AT);
  });

  it('alt sinira dayanan iki oyuncuyu gercek giris zamani ayirir', () => {
    const result = rank([
      entry({ playerId: 'gec', enteredAt: OPENED_AT + 9 * SEC, offsetSeconds: -600 }),
      entry({ playerId: 'erken', enteredAt: OPENED_AT + 3 * SEC, offsetSeconds: -600 }),
    ]);
    expect(result.map((p) => p.playerId)).toEqual(['erken', 'gec']);
  });

  it('VIP oyunculari her zaman en uste, vipRank duzeninde koyar', () => {
    const result = rank([
      entry({ playerId: 'normal', enteredAt: OPENED_AT + SEC }),
      entry({ playerId: 'vip2', entryType: 'vip', vipRank: 2 }),
      entry({ playerId: 'vip1', entryType: 'vip', vipRank: 1 }),
    ]);
    expect(result.map((p) => p.playerId)).toEqual(['vip1', 'vip2', 'normal']);
  });

  it('VIP katmani normalden cok sonra girse bile onde kalir - katman zamani yener', () => {
    const result = rank([
      entry({ playerId: 'normal', enteredAt: OPENED_AT + SEC }),
      entry({ playerId: 'vip', entryType: 'vip', vipRank: 1, enteredAt: OPENED_AT + 100 * SEC }),
    ]);
    expect(result.map((p) => p.playerId)).toEqual(['vip', 'normal']);
  });

  it('ayni vipRank tasiyan iki VIP girdi sirasi tersine cevrildiginde de ayni sonucu verir', () => {
    const a = entry({ playerId: 'zeta', entryType: 'vip', vipRank: 1 });
    const b = entry({ playerId: 'alfa', entryType: 'vip', vipRank: 1 });

    const first = rank([a, b]);
    const second = rank([b, a]);

    expect(first.map((p) => p.playerId)).toEqual(second.map((p) => p.playerId));
    expect(first.map((p) => p.playerId)).toEqual(['alfa', 'zeta']);
  });

  it('vipRank null olan iki VIP icin de girdi sirasindan bagimsiz ayni sonuc gelir', () => {
    const a = entry({ playerId: 'zeta', entryType: 'vip', vipRank: null });
    const b = entry({ playerId: 'alfa', entryType: 'vip', vipRank: null });

    const first = rank([a, b]);
    const second = rank([b, a]);

    expect(first.map((p) => p.playerId)).toEqual(second.map((p) => p.playerId));
    expect(first.map((p) => p.playerId)).toEqual(['alfa', 'zeta']);
  });

  it('oncelikliyi VIP altina, normallerin ustune koyar', () => {
    const result = rank([
      entry({ playerId: 'normal', enteredAt: OPENED_AT + SEC }),
      entry({ playerId: 'oncelikli', entryType: 'priority', enteredAt: OPENED_AT + 500 * SEC }),
      entry({ playerId: 'vip', entryType: 'vip', vipRank: 1 }),
    ]);
    expect(result.map((p) => p.playerId)).toEqual(['vip', 'oncelikli', 'normal']);
  });

  it('oncelikliler kendi aralarinda efektif zamana gore dizilir, katman atlamaz', () => {
    // o1 once girdi ama agir cezali; o2 sonra girdi, cezasiz.
    // Kendi aralarinda o2 one gecer ama ikisi de normalin ustunde kalir.
    const result = rank([
      entry({ playerId: 'normal', enteredAt: OPENED_AT + SEC }),
      entry({ playerId: 'o1', entryType: 'priority', enteredAt: OPENED_AT + 10 * SEC, offsetSeconds: 100 }),
      entry({ playerId: 'o2', entryType: 'priority', enteredAt: OPENED_AT + 20 * SEC }),
    ]);
    expect(result.map((p) => p.playerId)).toEqual(['o2', 'o1', 'normal']);
  });

  it('kadro boyutundan sonrasini yedek isaretler', () => {
    const entries = Array.from({ length: 16 }, (_, i) =>
      entry({ playerId: `o${i}`, enteredAt: OPENED_AT + i * SEC }),
    );
    const result = rank(entries, 14);
    expect(result.filter((p) => p.placement === 'squad')).toHaveLength(14);
    expect(result.filter((p) => p.placement === 'reserve')).toHaveLength(2);
    expect(result[13].placement).toBe('squad');
    expect(result[14].placement).toBe('reserve');
  });

  it('kadro boyutu degisince kadro/yedek siniri da degisir', () => {
    const entries = Array.from({ length: 18 }, (_, i) =>
      entry({ playerId: `o${i}`, enteredAt: OPENED_AT + i * SEC }),
    );
    const result = rank(entries, 16);
    expect(result.filter((p) => p.placement === 'squad')).toHaveLength(16);
  });

  it('cikan oyuncuyu listeden dusurur ve yedek terfi eder', () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      entry({ playerId: `o${i}`, enteredAt: OPENED_AT + i * SEC }),
    );
    entries[0].withdrawnAt = OPENED_AT + 999 * SEC;

    const result = rank(entries, 14);
    expect(result).toHaveLength(14);
    expect(result.map((p) => p.playerId)).not.toContain('o0');
    // 15. sirada yedek olan o14 artik kadroda
    expect(result.find((p) => p.playerId === 'o14')?.placement).toBe('squad');
  });

  it('girdi dizisini degistirmez', () => {
    const entries = [
      entry({ playerId: 'b', enteredAt: OPENED_AT + 20 * SEC }),
      entry({ playerId: 'a', enteredAt: OPENED_AT + 10 * SEC }),
    ];
    const copy = JSON.parse(JSON.stringify(entries));
    rank(entries);
    expect(entries).toEqual(copy);
  });
});
