import type { LedgerDirection } from './ledger';

/**
 * Kasaya para iki yoldan girer: oyuncu odemeleri (match_squad.amount_paid) ve
 * elle girilen gelir/gider kayitlari (ledger_entries). Muhasebe ekranindaki
 * "Kasa hareketleri" listesi ikisini birlikte, gun gun gosterir; bu dosya o
 * birlestirmeyi ve gruplamayi yapar.
 */
export type CashMovementKind = 'ledger' | 'player';

export type CashMovement = {
  id: string;
  /** Hareketin kasaya girdigi gun, "YYYY-MM-DD" (Turkiye gunu) */
  day: string;
  kind: CashMovementKind;
  direction: LedgerDirection;
  amount: number;
  /** Listedeki "Kalem" sutunu */
  label: string;
  /** Listedeki "Detay" sutunu */
  detail: string;
  /** Dolu ise satir o haftanin odemeler sayfasina baglanir */
  matchId: string | null;
  /** Gun icinde siralama icin tam an; yalnizca tarihi bilinen kayitlarda bos */
  at: string | null;
  /** Ters fisi kesilmis kayit ustu cizili gosterilir (yalniz ledger) */
  reversedAt?: string | null;
  /** Kendisi bir ters fis mi (yalniz ledger) */
  reversesId?: string | null;
};

export type CashDay = {
  day: string;
  income: number;
  expense: number;
  /** Gunun kasaya net etkisi */
  net: number;
  movements: CashMovement[];
};

const dayKeyFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' });

/**
 * Bir ani Turkiye gunune cevirir: "2026-09-20T22:30:00Z" -> "2026-09-21".
 * Yalnizca tarih tutan kolonlar ("2026-09-20") oldugu gibi geri doner.
 */
export function dayKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return dayKeyFormatter.format(new Date(value));
}

/**
 * Hareketleri gune gore toplar. Gunler yeniden eskiye, gun icindeki satirlar
 * da ani bilinenler once olacak sekilde siralanir.
 *
 * Iptal edilmis (ters fisi kesilmis) kayitlar ve ters fisin kendisi de
 * toplama girer: ikisi birbirini gotururken hareket listede gorunur kalir.
 */
export function groupByDay(movements: CashMovement[]): CashDay[] {
  const days = new Map<string, CashDay>();

  for (const movement of movements) {
    const day = days.get(movement.day) ?? {
      day: movement.day,
      income: 0,
      expense: 0,
      net: 0,
      movements: [],
    };

    if (movement.direction === 'income') day.income += movement.amount;
    else day.expense += movement.amount;
    day.net = day.income - day.expense;
    day.movements.push(movement);

    days.set(movement.day, day);
  }

  for (const day of days.values()) {
    day.movements.sort((a, b) => {
      if (a.at && b.at) return b.at.localeCompare(a.at);
      if (a.at) return -1;
      if (b.at) return 1;
      return 0;
    });
  }

  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}
