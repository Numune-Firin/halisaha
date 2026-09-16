import { describe, it, expect } from 'vitest';
import { anketiSirala } from './sirala';
import type { AnketGirisi } from './types';

const ACILIS = 1_000_000_000_000; // sabit anket acilis zamani
const SN = 1000;

function giris(over: Partial<AnketGirisi> & { oyuncuId: string }): AnketGirisi {
  return {
    tip: 'normal',
    girisZamani: ACILIS,
    ofsetSn: 0,
    vipSira: null,
    cikisZamani: null,
    ...over,
  };
}

function sirala(girisler: AnketGirisi[], kadroBoyutu = 14) {
  return anketiSirala({ girisler, anketAcilis: ACILIS, kadroBoyutu });
}

describe('anketiSirala', () => {
  it('bos listede bos dizi doner', () => {
    expect(sirala([])).toEqual([]);
  });

  it('normal oyunculari giris sirasina gore dizer', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'c', girisZamani: ACILIS + 30 * SN }),
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 10 * SN }),
      giris({ oyuncuId: 'b', girisZamani: ACILIS + 20 * SN }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['a', 'b', 'c']);
    expect(sonuc.map((o) => o.sira)).toEqual([1, 2, 3]);
  });

  it('ceza oyuncuyu geriye atar', () => {
    // a once girdi ama +10sn cezali; b 6 saniye sonra girdi, cezasiz.
    // a'nin efektif zamani ACILIS+20sn, b'ninki ACILIS+16sn -> b one gecer.
    const sonuc = sirala([
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 10 * SN, ofsetSn: 10 }),
      giris({ oyuncuId: 'b', girisZamani: ACILIS + 16 * SN }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['b', 'a']);
  });

  it('odul oyuncuyu one ceker', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 30 * SN }),
      giris({ oyuncuId: 'b', girisZamani: ACILIS + 40 * SN, ofsetSn: -20 }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['b', 'a']);
  });

  it('odul efektif zamani anket acilisinin oncesine tasimaz', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 5 * SN, ofsetSn: -600 }),
    ]);
    expect(sonuc[0].efektifZaman).toBe(ACILIS);
  });

  it('alt sinira dayanan iki oyuncuyu gercek giris zamani ayirir', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'gec', girisZamani: ACILIS + 9 * SN, ofsetSn: -600 }),
      giris({ oyuncuId: 'erken', girisZamani: ACILIS + 3 * SN, ofsetSn: -600 }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['erken', 'gec']);
  });

  it('VIP oyunculari her zaman en uste, vipSira duzeninde koyar', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'normal', girisZamani: ACILIS + SN }),
      giris({ oyuncuId: 'vip2', tip: 'vip', vipSira: 2 }),
      giris({ oyuncuId: 'vip1', tip: 'vip', vipSira: 1 }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['vip1', 'vip2', 'normal']);
  });

  it('VIP katmani normalden cok sonra girse bile onde kalir - katman zamani yener', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'normal', girisZamani: ACILIS + SN }),
      giris({ oyuncuId: 'vip', tip: 'vip', vipSira: 1, girisZamani: ACILIS + 100 * SN }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['vip', 'normal']);
  });

  it('ayni vipSira tasiyan iki VIP girdi sirasi tersine cevrildiginde de ayni sonucu verir', () => {
    const a = giris({ oyuncuId: 'zeta', tip: 'vip', vipSira: 1 });
    const b = giris({ oyuncuId: 'alfa', tip: 'vip', vipSira: 1 });

    const sonuc1 = sirala([a, b]);
    const sonuc2 = sirala([b, a]);

    expect(sonuc1.map((o) => o.oyuncuId)).toEqual(sonuc2.map((o) => o.oyuncuId));
    expect(sonuc1.map((o) => o.oyuncuId)).toEqual(['alfa', 'zeta']);
  });

  it('vipSira null olan iki VIP icin de girdi sirasindan bagimsiz ayni sonuc gelir', () => {
    const a = giris({ oyuncuId: 'zeta', tip: 'vip', vipSira: null });
    const b = giris({ oyuncuId: 'alfa', tip: 'vip', vipSira: null });

    const sonuc1 = sirala([a, b]);
    const sonuc2 = sirala([b, a]);

    expect(sonuc1.map((o) => o.oyuncuId)).toEqual(sonuc2.map((o) => o.oyuncuId));
    expect(sonuc1.map((o) => o.oyuncuId)).toEqual(['alfa', 'zeta']);
  });

  it('oncelikliyi VIP altina, normallerin ustune koyar', () => {
    const sonuc = sirala([
      giris({ oyuncuId: 'normal', girisZamani: ACILIS + SN }),
      giris({ oyuncuId: 'oncelikli', tip: 'oncelikli', girisZamani: ACILIS + 500 * SN }),
      giris({ oyuncuId: 'vip', tip: 'vip', vipSira: 1 }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['vip', 'oncelikli', 'normal']);
  });

  it('oncelikliler kendi aralarinda efektif zamana gore dizilir, katman atlamaz', () => {
    // o1 once girdi ama agir cezali; o2 sonra girdi, cezasiz.
    // Kendi aralarinda o2 one gecer ama ikisi de normalin ustunde kalir.
    const sonuc = sirala([
      giris({ oyuncuId: 'normal', girisZamani: ACILIS + SN }),
      giris({ oyuncuId: 'o1', tip: 'oncelikli', girisZamani: ACILIS + 10 * SN, ofsetSn: 100 }),
      giris({ oyuncuId: 'o2', tip: 'oncelikli', girisZamani: ACILIS + 20 * SN }),
    ]);
    expect(sonuc.map((o) => o.oyuncuId)).toEqual(['o2', 'o1', 'normal']);
  });

  it('kadro boyutundan sonrasini yedek isaretler', () => {
    const girisler = Array.from({ length: 16 }, (_, i) =>
      giris({ oyuncuId: `o${i}`, girisZamani: ACILIS + i * SN }),
    );
    const sonuc = sirala(girisler, 14);
    expect(sonuc.filter((o) => o.konum === 'kadro')).toHaveLength(14);
    expect(sonuc.filter((o) => o.konum === 'yedek')).toHaveLength(2);
    expect(sonuc[13].konum).toBe('kadro');
    expect(sonuc[14].konum).toBe('yedek');
  });

  it('kadro boyutu degisince kadro/yedek siniri da degisir', () => {
    const girisler = Array.from({ length: 18 }, (_, i) =>
      giris({ oyuncuId: `o${i}`, girisZamani: ACILIS + i * SN }),
    );
    const sonuc = sirala(girisler, 16);
    expect(sonuc.filter((o) => o.konum === 'kadro')).toHaveLength(16);
  });

  it('cikan oyuncuyu listeden dusurur ve yedek terfi eder', () => {
    const girisler = Array.from({ length: 15 }, (_, i) =>
      giris({ oyuncuId: `o${i}`, girisZamani: ACILIS + i * SN }),
    );
    girisler[0].cikisZamani = ACILIS + 999 * SN;

    const sonuc = sirala(girisler, 14);
    expect(sonuc).toHaveLength(14);
    expect(sonuc.map((o) => o.oyuncuId)).not.toContain('o0');
    // 15. sirada yedek olan o14 artik kadroda
    expect(sonuc.find((o) => o.oyuncuId === 'o14')?.konum).toBe('kadro');
  });

  it('girdi dizisini degistirmez', () => {
    const girisler = [
      giris({ oyuncuId: 'b', girisZamani: ACILIS + 20 * SN }),
      giris({ oyuncuId: 'a', girisZamani: ACILIS + 10 * SN }),
    ];
    const kopya = JSON.parse(JSON.stringify(girisler));
    sirala(girisler);
    expect(girisler).toEqual(kopya);
  });
});
