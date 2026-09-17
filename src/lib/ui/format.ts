/** Butun sayfalarda ayni bicim: sunucu saat diliminden bagimsiz, Turkiye saati. */
const TIME_ZONE = 'Europe/Istanbul';

const kickoffFormatter = new Intl.DateTimeFormat('tr-TR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});

const dayFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
});

const shortFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});

/** "Cumartesi, 20 Eylül 21:00" */
export function formatKickoff(value: string) {
  return kickoffFormatter.format(new Date(value));
}

/** "20 Eylül 2026" — yalnizca tarih tutan kolonlar icin. */
export function formatDay(value: string) {
  return dayFormatter.format(new Date(value));
}

/** "20.09.2026 21:00" */
export function formatShort(value: string) {
  return shortFormatter.format(new Date(value));
}

export type MatchStatus =
  | 'poll_open'
  | 'squad_locked'
  | 'played'
  | 'completed'
  | 'cancelled';

/**
 * Ekranda gorunen durum. Mac saati gectikten sonra anket kendiliginden kapanir:
 * durum kolonu 'poll_open' kalsa bile o anket artik acik degildir, kimse
 * giremez. Veritabanina yazmak yerine goruntuleme aninda hesaplanir, boylece
 * arka planda calisan bir is gerekmez.
 */
export type MatchDisplayStatus = MatchStatus | 'expired';

export const MATCH_STATUS_LABELS: Record<MatchDisplayStatus, string> = {
  poll_open: 'Anket açık',
  squad_locked: 'Kadro kesin',
  played: 'Oynandı',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
  expired: 'Anket kapandı',
};

export const MATCH_STATUS_BADGES: Record<MatchDisplayStatus, string> = {
  poll_open: 'badge badge-live',
  squad_locked: 'badge badge-vip',
  played: 'badge badge-muted',
  completed: 'badge badge-muted',
  cancelled: 'badge badge-danger',
  expired: 'badge badge-muted',
};

/** Mac saati gecmis acik anket 'expired' olarak gosterilir. */
export function displayStatus(status: MatchStatus, kickoffAt: string): MatchDisplayStatus {
  if (status === 'poll_open' && new Date(kickoffAt).getTime() <= Date.now()) return 'expired';
  return status;
}

/** Anket gercekten acik mi: durumu poll_open ve mac saati henuz gelmemis. */
export function isPollLive(status: MatchStatus, kickoffAt: string) {
  return displayStatus(status, kickoffAt) === 'poll_open';
}
