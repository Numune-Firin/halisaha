/**
 * Oyuncunun siralama katmani. Anket sirasi once VIP, sonra oncelikli, en son
 * normal girisler diye dizilir; VIP ayrica "sabit oyuncu" demektir ve anket
 * acilir acilmaz listeye kendiliginden yazilir.
 */
export type PlayerTier = 'vip' | 'priority' | 'standard';

export const TIER_LABELS: Record<PlayerTier, string> = {
  vip: 'VIP (sabit)',
  priority: 'Öncelikli',
  standard: 'Normal',
};

/** Listede rozet olarak yalnizca ayricalikli katmanlar gosterilir. */
export const TIER_BADGES: Record<PlayerTier, string | null> = {
  vip: 'badge badge-vip',
  priority: 'badge badge-priority',
  standard: null,
};

export const TIER_OPTIONS: { value: PlayerTier; label: string }[] = [
  { value: 'standard', label: TIER_LABELS.standard },
  { value: 'priority', label: TIER_LABELS.priority },
  { value: 'vip', label: TIER_LABELS.vip },
];

export function parseTier(value: FormDataEntryValue | null): PlayerTier {
  const raw = String(value ?? '');
  if (raw === 'vip' || raw === 'priority' || raw === 'standard') return raw;
  throw new Error('Geçerli bir sıra katmanı seç');
}
