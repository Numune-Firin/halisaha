import { describe, expect, it } from 'vitest';
import { auditVotes, type VoteRow } from './vote-audit';

/** Kisa yazim: "a->b:5" gibi satirlardan oy listesi kurar. */
function votes(...entries: string[]): VoteRow[] {
  return entries.map((entry) => {
    const [pair, stars] = entry.split(':');
    const [raterId, rateeId] = pair.split('->');
    return {
      raterId,
      raterName: raterId.toUpperCase(),
      rateeId,
      rateeName: rateeId.toUpperCase(),
      stars: Number(stars),
    };
  });
}

/** Herkesin herkese orta puan verdigi, sorunsuz bir mac. */
function normalMatch(): VoteRow[] {
  const people = ['a', 'b', 'c', 'd', 'e'];
  const rows: VoteRow[] = [];
  for (const rater of people) {
    for (const ratee of people) {
      if (rater === ratee) continue;
      rows.push(...votes(`${rater}->${ratee}:3`));
    }
  }
  return rows;
}

describe('auditVotes', () => {
  it('düzgün oylamada uyarı üretmez', () => {
    expect(auditVotes(normalMatch())).toEqual([]);
  });

  it('boş listede sessiz kalır', () => {
    expect(auditVotes([])).toEqual([]);
  });

  it('az oy veren kişiyi denetlemez', () => {
    // Uc oy: niyet okunmaz
    const flags = auditVotes(votes('a->b:5', 'a->c:1', 'a->d:1'));
    expect(flags).toEqual([]);
  });

  it('birine 5 kalanlara 1 vereni kayırma olarak işaretler', () => {
    const rows = [...normalMatch(), ...votes('x->b:5', 'x->c:1', 'x->d:1', 'x->e:1')];
    const flags = auditVotes(rows).filter((f) => f.raterId === 'x');

    expect(flags.some((f) => f.kind === 'favoritism')).toBe(true);
    expect(flags.find((f) => f.kind === 'favoritism')?.message).toContain('B');
  });

  it('herkese düşük vereni bastırma olarak işaretler', () => {
    const rows = [...normalMatch(), ...votes('x->b:1', 'x->c:1', 'x->d:1', 'x->e:1')];
    const flags = auditVotes(rows).filter((f) => f.raterId === 'x');

    expect(flags.some((f) => f.kind === 'suppression')).toBe(true);
  });

  it('birbirine yüksek, diğerlerine düşük veren ikiliyi yakalar', () => {
    const rows = [
      ...normalMatch(),
      ...votes('x->y:5', 'x->b:1', 'x->c:2', 'x->d:1'),
      ...votes('y->x:5', 'y->b:2', 'y->c:1', 'y->d:2'),
    ];
    const flags = auditVotes(rows).filter((f) => f.kind === 'mutual');

    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('Anlaşmış olabilirler');
  });

  it('aynı ikiliyi iki kez raporlamaz', () => {
    const rows = [
      ...votes('x->y:5', 'x->b:1', 'x->c:1', 'x->d:1'),
      ...votes('y->x:5', 'y->b:1', 'y->c:1', 'y->d:1'),
    ];
    const mutual = auditVotes(rows).filter((f) => f.kind === 'mutual');

    expect(mutual).toHaveLength(1);
  });

  it('grubun kanaatinden sürekli sapanı işaretler', () => {
    // Herkes bu dorde 3 verirken x hepsine 5 veriyor: dort aykiri oy
    const rows = [...normalMatch(), ...votes('x->b:5', 'x->c:5', 'x->d:5', 'x->e:5')];
    const flags = auditVotes(rows).filter((f) => f.raterId === 'x');

    expect(flags.some((f) => f.kind === 'outlier')).toBe(true);
  });

  it('tek bir farklı oy için uyarı vermez', () => {
    const rows = [...normalMatch(), ...votes('x->b:5', 'x->c:3', 'x->d:3', 'x->e:3')];
    const flags = auditVotes(rows).filter((f) => f.raterId === 'x' && f.kind === 'outlier');

    expect(flags).toEqual([]);
  });
});
