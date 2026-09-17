import type { Position } from '@/lib/poll/types';

/** Oyuncu kartinda ve listelerde tam ad. */
export const POSITION_LABELS: Record<Position, string> = {
  goalkeeper: 'Kaleci',
  defender: 'Defans',
  midfielder: 'Orta saha',
  forward: 'Forvet',
};

/** Dar satirlarda (anket listesi) sigmasi icin kisaltma. */
export const POSITION_SHORT: Record<Position, string> = {
  goalkeeper: 'KL',
  defender: 'DF',
  midfielder: 'OS',
  forward: 'FV',
};

/** Select alanlarinin tek kaynagi; sira sahadaki dizilis sirasidir. */
export const POSITION_OPTIONS: { value: Position; label: string }[] = (
  ['goalkeeper', 'defender', 'midfielder', 'forward'] as Position[]
).map((value) => ({ value, label: POSITION_LABELS[value] }));

/** Form alanindan gelen serbest metni gecerli bir mevkiye ya da null'a cevirir. */
export function parsePosition(value: FormDataEntryValue | null): Position | null {
  const text = String(value ?? '');
  return POSITION_OPTIONS.some((o) => o.value === text) ? (text as Position) : null;
}
