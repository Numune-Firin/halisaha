/** ISO haftagunu sirasi: 1 = Pazartesi ... 7 = Pazar. 0. eleman kullanilmaz. */
export const WEEKDAY_LABELS = [
  '',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;

export const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((value) => ({
  value,
  label: WEEKDAY_LABELS[value],
}));

/**
 * Turkiye 2016'dan beri sabit UTC+3 kullanir, yaz saati uygulamasi yoktur.
 * Bu yuzden yerel bir gun+saat, sabit ofsetle dogrudan bir ana cevrilebilir.
 */
const TURKEY_UTC_OFFSET = '+03:00';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bir takvim tanimindan (haftagunu + saat) siradaki maç anlarini uretir.
 * Yalnizca onizleme icindir; maclari gercekten olusturan yer veritabanindaki
 * ensure_scheduled_matches() fonksiyonudur.
 *
 * @param weekday   ISO haftagunu, 1 = Pazartesi
 * @param startTime 'HH:MM' ya da 'HH:MM:SS'
 * @returns ISO 8601 zaman damgalari, en yakindan uzaga
 */
export function nextOccurrences(
  weekday: number,
  startTime: string,
  count: number,
): string[] {
  const nowMs = Date.now();
  // Sunucu hangi saat diliminde olursa olsun "Turkiye'de bugun" ayni cikar
  const istanbulNow = new Date(nowMs + 3 * 60 * 60 * 1000);
  const baseMs = Date.UTC(
    istanbulNow.getUTCFullYear(),
    istanbulNow.getUTCMonth(),
    istanbulNow.getUTCDate(),
  );
  const baseWeekday = ((new Date(baseMs).getUTCDay() + 6) % 7) + 1;
  const daysAhead = (weekday - baseWeekday + 7) % 7;
  const time = startTime.slice(0, 5);

  const out: string[] = [];
  for (let week = 0; out.length < count && week < count + 2; week++) {
    const day = new Date(baseMs + (daysAhead + week * 7) * DAY_MS);
    const iso = `${day.toISOString().slice(0, 10)}T${time}:00${TURKEY_UTC_OFFSET}`;
    // Bu haftanin gunu gecmisse atlanir
    if (new Date(iso).getTime() > nowMs) out.push(new Date(iso).toISOString());
  }
  return out;
}
