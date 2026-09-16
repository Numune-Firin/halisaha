import { describe, it, expect } from 'vitest';
import { cikisiDegerlendir } from './cikis';

const SAAT = 60 * 60 * 1000;
const MAC = 1_000_000_000_000;

describe('cikisiDegerlendir', () => {
  it('pencere icinde cikista ceza yazmaz', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC - 30 * SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 8,
    });
    expect(sonuc).toEqual({ gecCikis: false, cezaSn: 0 });
  });

  it('pencere kapandiktan sonra cikista ceza yazar', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC - 5 * SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 8,
    });
    expect(sonuc).toEqual({ gecCikis: true, cezaSn: 8 });
  });

  it('tam sinir aninda cikis gec sayilir', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC - 20 * SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 8,
    });
    expect(sonuc.gecCikis).toBe(true);
  });

  it('mac saatinden sonraki cikis da gec sayilir', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC + SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 8,
    });
    expect(sonuc.gecCikis).toBe(true);
  });

  it('ceza sifir tanimlandiysa gec cikista da ceza yazmaz', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC - SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 20,
      gecCikisCezasiSn: 0,
    });
    expect(sonuc).toEqual({ gecCikis: true, cezaSn: 0 });
  });

  it('pencere sifir saat ise yalnizca mac saatinden sonrasi gec sayilir', () => {
    const erken = cikisiDegerlendir({
      simdi: MAC - SAAT,
      macZamani: MAC,
      cikisPenceresiSaat: 0,
      gecCikisCezasiSn: 8,
    });
    expect(erken.gecCikis).toBe(false);
  });

  it('pencere sifir saatte mac zamaninda ve sonrasinda cikis gec sayilir', () => {
    const sonuc = cikisiDegerlendir({
      simdi: MAC,
      macZamani: MAC,
      cikisPenceresiSaat: 0,
      gecCikisCezasiSn: 8,
    });
    expect(sonuc.gecCikis).toBe(true);
  });
});
