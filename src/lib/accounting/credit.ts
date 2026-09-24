import type { LedgerCategory } from '@/lib/ui/ledger';
import type { MatchStatus } from '@/lib/ui/format';

/**
 * Oyuncu cari hesabi.
 *
 * Hesabin kendisi veritabaninda (player_ledger fonksiyonu) yurutulur: her olay
 * icin oncesi/sonrasi bakiye ve o hafta gercekten odenmesi gereken tutar orada
 * hesaplanir. Buradaki isler yalnizca o satirlari kisi bazinda toparlar.
 */
export type CreditEventKind = 'match' | 'conversion';

export interface CreditEvent {
  personId: string;
  isGuest: boolean;
  fullName: string;
  occurredAt: string;
  kind: CreditEventKind;
  matchId: string | null;
  squadId: string | null;
  matchStatus: MatchStatus | null;
  /** Yalnizca cevirme satirlarinda dolu: bagis mi ikram mi */
  category: LedgerCategory | null;
  note: string;
  /** Haftanin ucreti; cevirmede alacaktan dusulen tutar */
  charged: number;
  /** O hafta tahsil edilen nakit */
  paid: number;
  balanceBefore: number;
  /** Onceki bakiye islendikten sonra nakit odenmesi gereken tutar */
  due: number;
  balanceAfter: number;
}

export interface PersonAccount {
  personId: string;
  isGuest: boolean;
  fullName: string;
  /** Artı ise oyuncunun alacagi, eksi ise borcu */
  balance: number;
  /** Oynadigi (iptal olmayan) haftalarin toplam ucreti */
  charged: number;
  /** Bugune kadar odedigi nakit */
  paid: number;
  /** Alacagindan bagisa/ikrama biraktigi tutar */
  donated: number;
  /** Alacagindan dusulerek kapanan hafta ucreti */
  creditUsed: number;
  /** Gecmis borcundan o haftalarin ucretine eklenen tutar */
  debtCarried: number;
  matchCount: number;
  events: CreditEvent[];
}

/**
 * Olaylari kisi bazinda toplar. Bakiye, son olayin sonrasindaki bakiyedir;
 * olay yoksa sifirdir.
 *
 * Siralama: once alacakli olanlar (cok alacaktan aza), sonra borclular, en
 * sonda hesabi kapali olanlar. Yoneticinin once ilgilenmesi gereken satirlar
 * uste gelsin diye boyle.
 */
export function summarizeAccounts(events: CreditEvent[]): PersonAccount[] {
  const byPerson = new Map<string, PersonAccount>();

  for (const event of events) {
    const account = byPerson.get(event.personId) ?? {
      personId: event.personId,
      isGuest: event.isGuest,
      fullName: event.fullName,
      balance: 0,
      charged: 0,
      paid: 0,
      donated: 0,
      creditUsed: 0,
      debtCarried: 0,
      matchCount: 0,
      events: [],
    };

    if (event.kind === 'conversion') {
      account.donated += event.charged;
    } else {
      account.charged += event.charged;
      account.matchCount += 1;
      // Beklenen tutar haftanin ucretinden dusukse aradaki fark alacaktan
      // karsilanmistir; yuksekse gecmis borc uzerine binmistir
      account.creditUsed += Math.max(0, event.charged - event.due);
      account.debtCarried += Math.max(0, event.due - event.charged);
    }
    account.paid += event.paid;
    account.balance = event.balanceAfter;
    account.events.push(event);

    byPerson.set(event.personId, account);
  }

  return [...byPerson.values()].sort(
    (a, b) => b.balance - a.balance || a.fullName.localeCompare(b.fullName, 'tr'),
  );
}

/** Kasada duran, oyunculara ait toplam alacak. */
export function totalCredit(accounts: PersonAccount[]): number {
  return accounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
}

/** Oyuncularin toplam borcu. */
export function totalDebt(accounts: PersonAccount[]): number {
  return accounts.reduce((sum, a) => sum + Math.max(0, -a.balance), 0);
}
