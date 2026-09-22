/**
 * Oylama denetimi.
 *
 * Kimse kendine oy veremez (veritabani kurali), ama MVP'yi belirlemek icin
 * baska yollar var: bir kisiye bes verip kalan herkese bir vermek, ya da iki
 * kisinin birbirine bes verip digerlerini asagi cekmesi.
 *
 * Buradaki olcumler suclama degil, "buna bir bak" isaretidir. Karari yonetici
 * verir; oyu silmek ya da oldugu gibi birakmak onun elinde.
 *
 * Dort isaret aranir:
 *   1) Kayirma       - birine verdigi, digerlerine verdiginin cok ustunde
 *   2) Bastirma      - herkese, digerlerinin verdiginden belirgin dusuk vermis
 *   3) Karsilikli    - iki kisi birbirine yuksek, digerlerine dusuk vermis
 *   4) Aykirilik     - verdigi puanlar grubun kanaatinden surekli uzak
 *
 * Esikler bilerek genis: az oyda ya da kucuk farkta uyari cikmaz, yoksa her
 * hafta herkes isaretlenir ve uyari anlamini yitirir.
 */

export interface VoteRow {
  raterId: string;
  raterName: string;
  rateeId: string;
  rateeName: string;
  stars: number;
}

export type VoteFlagKind = 'favoritism' | 'suppression' | 'mutual' | 'outlier';

export interface VoteFlag {
  raterId: string;
  raterName: string;
  kind: VoteFlagKind;
  /** Yoneticinin okuyacagi cumle; rakamlari icerir */
  message: string;
}

/** Bu sayidan az oy veren denetlenmez: iki oyla niyet okunmaz. */
const MIN_VOTES = 4;

/** Birine verdigi puan, digerlerine verdiginin bu kadar ustundeyse kayirma. */
const FAVOURITE_GAP = 2.5;

/** Digerlerinin ortalamasindan bu kadar dusuk veren bastiriyor olabilir. */
const SUPPRESSION_GAP = 1.5;

/** Karsilikli kayirma: birbirlerine en az bu kadar, digerlerine en fazla su kadar. */
const MUTUAL_HIGH = 4;
const MUTUAL_OTHERS = 2.5;

/** Grubun kanaatinden bu kadar sapan oy aykiridir. */
const OUTLIER_GAP = 2;

/** Aykiri oy sayisi bunu asarsa isaretlenir; tek sapma insanidir. */
const OUTLIER_COUNT = 2;

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function auditVotes(rows: VoteRow[]): VoteFlag[] {
  if (rows.length === 0) return [];

  const byRater = new Map<string, VoteRow[]>();
  for (const row of rows) {
    byRater.set(row.raterId, [...(byRater.get(row.raterId) ?? []), row]);
  }

  const flags: VoteFlag[] = [];

  for (const [raterId, given] of byRater) {
    if (given.length < MIN_VOTES) continue;
    const raterName = given[0].raterName;

    // 1) Kayirma: en yuksek verdigi kisi ile geri kalanin arasi acik mi
    const sorted = [...given].sort((a, b) => b.stars - a.stars);
    const top = sorted[0];
    const rest = sorted.slice(1);
    const restAverage = mean(rest.map((r) => r.stars));

    if (rest.length > 0 && top.stars - restAverage >= FAVOURITE_GAP) {
      flags.push({
        raterId,
        raterName,
        kind: 'favoritism',
        message: `${top.rateeName} oyuncusuna ${top.stars} yıldız verdi, kalan ${rest.length} kişiye ortalama ${round(restAverage)}. Aradaki fark ${round(top.stars - restAverage)} yıldız.`,
      });
    }

    // 2) Bastirma: herkese, digerlerinin verdiginden belirgin dusuk vermis.
    // Karsilastirma kendi oylari haric yapilir; yoksa cok dusuk veren kisi
    // genel ortalamayi kendisi asagi cekip fark kapaniyordu.
    const ownAverage = mean(given.map((r) => r.stars));
    const othersAverage = mean(rows.filter((r) => r.raterId !== raterId).map((r) => r.stars));

    if (othersAverage - ownAverage >= SUPPRESSION_GAP) {
      flags.push({
        raterId,
        raterName,
        kind: 'suppression',
        message: `Verdiği oyların ortalaması ${round(ownAverage)}; aynı maçta diğerleri ortalama ${round(othersAverage)} vermiş. Herkesi aşağı çekmiş olabilir.`,
      });
    }

    // 4) Aykirilik: verdigi puan, o oyuncunun digerlerinden aldigindan uzak mi
    let outliers = 0;
    for (const vote of given) {
      const others = rows.filter((r) => r.rateeId === vote.rateeId && r.raterId !== raterId);
      if (others.length < 2) continue;
      if (Math.abs(vote.stars - mean(others.map((r) => r.stars))) >= OUTLIER_GAP) outliers += 1;
    }

    if (outliers > OUTLIER_COUNT) {
      flags.push({
        raterId,
        raterName,
        kind: 'outlier',
        message: `${outliers} oyu, o oyuncuların diğerlerinden aldığı ortalamadan en az ${OUTLIER_GAP} yıldız uzak. Grubun kanaatinden sürekli ayrışıyor.`,
      });
    }
  }

  // 3) Karsilikli kayirma: cift yonlu bakilir, her cift bir kez raporlanir
  const seen = new Set<string>();
  for (const [raterId, given] of byRater) {
    for (const vote of given) {
      if (vote.stars < MUTUAL_HIGH) continue;

      const back = (byRater.get(vote.rateeId) ?? []).find((r) => r.rateeId === raterId);
      if (!back || back.stars < MUTUAL_HIGH) continue;

      const pairKey = [raterId, vote.rateeId].sort().join('|');
      if (seen.has(pairKey)) continue;

      const mine = mean(given.filter((r) => r.rateeId !== vote.rateeId).map((r) => r.stars));
      const theirs = mean(
        (byRater.get(vote.rateeId) ?? [])
          .filter((r) => r.rateeId !== raterId)
          .map((r) => r.stars),
      );
      if (mine > MUTUAL_OTHERS || theirs > MUTUAL_OTHERS) continue;

      seen.add(pairKey);
      flags.push({
        raterId,
        raterName: vote.raterName,
        kind: 'mutual',
        message: `${vote.raterName} ile ${vote.rateeName} birbirine ${vote.stars} ve ${back.stars} yıldız verdi; diğerlerine ortalamaları ${round(mine)} ve ${round(theirs)}. Anlaşmış olabilirler.`,
      });
    }
  }

  return flags;
}

export const VOTE_FLAG_LABELS: Record<VoteFlagKind, string> = {
  favoritism: 'Tek kişiyi öne çıkarmış',
  suppression: 'Herkesi aşağı çekmiş',
  mutual: 'Karşılıklı yüksek oy',
  outlier: 'Gruptan ayrışıyor',
};
