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

// Ankette sira saniyeye gore belirlenir; giris anlari saniyesiyle gosterilir
const stampFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
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

/** "20.09.2026 21:00:07" — sira saniyeyle belirlendigi icin giris anlari boyle yazilir. */
export function formatStamp(value: string) {
  return stampFormatter.format(new Date(value));
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
export type MatchDisplayStatus = MatchStatus | 'expired' | 'upcoming';

export const MATCH_STATUS_LABELS: Record<MatchDisplayStatus, string> = {
  poll_open: 'Anket açık',
  squad_locked: 'Kadro kesin',
  played: 'Oynandı',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
  expired: 'Anket kapandı',
  upcoming: 'Anket açılmadı',
};

export const MATCH_STATUS_BADGES: Record<MatchDisplayStatus, string> = {
  poll_open: 'badge badge-live',
  squad_locked: 'badge badge-vip',
  played: 'badge badge-muted',
  completed: 'badge badge-muted',
  cancelled: 'badge badge-danger',
  expired: 'badge badge-muted',
  upcoming: 'badge badge-muted',
};

/**
 * Ekranda gorunen durum:
 *   - anket saati henuz gelmediyse 'upcoming'
 *   - mac saati gectiyse 'expired'
 *   - digerlerinde kaydin kendi durumu
 */
export function displayStatus(
  status: MatchStatus,
  kickoffAt: string,
  pollOpenedAt?: string | null,
): MatchDisplayStatus {
  if (status !== 'poll_open') return status;
  if (new Date(kickoffAt).getTime() <= Date.now()) return 'expired';
  if (pollOpenedAt && new Date(pollOpenedAt).getTime() > Date.now()) return 'upcoming';
  return status;
}

/** Anket gercekten acik mi: saati gelmis, mac saati gecmemis. */
export function isPollLive(status: MatchStatus, kickoffAt: string, pollOpenedAt?: string | null) {
  return displayStatus(status, kickoffAt, pollOpenedAt) === 'poll_open';
}
