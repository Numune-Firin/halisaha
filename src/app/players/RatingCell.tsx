import type { RatingSummary } from '@/lib/db/ratings';

/**
 * Oyuncunun genel yildizi. Yonetici elle bir deger yazdiysa (override) o
 * gecerlidir; yoksa butun maclardan gelen ortalama gosterilir. Kutuyu bos
 * birakip kaydetmek elle yazilan degeri siler, ortalamaya geri doner.
 */
export function RatingCell({
  action,
  override,
  summary,
  canEdit,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  override: number | null;
  summary: RatingSummary | null;
  canEdit: boolean;
  label: string;
}) {
  const shown = override ?? summary?.average ?? null;

  if (!canEdit) {
    return (
      <span className="badge badge-muted" title={`${summary?.votes ?? 0} oy`}>
        {shown === null ? 'Oy yok' : `★ ${shown.toFixed(1)}`}
      </span>
    );
  }

  return (
    <form action={action} className="flex items-center gap-1.5">
      <span className="text-amber-400" aria-hidden>
        ★
      </span>
      <input
        name="rating"
        type="number"
        min={1}
        max={5}
        step="0.1"
        defaultValue={override ?? ''}
        placeholder={summary ? summary.average.toFixed(1) : '—'}
        aria-label={`${label} genel yıldızı`}
        title={
          override !== null
            ? 'Elle yazıldı; boşaltıp kaydedersen ortalamaya döner'
            : `Maç ortalaması${summary ? ` · ${summary.votes} oy` : ''}`
        }
        className="input input-sm w-16"
      />
      <button className="btn btn-ghost btn-sm">Kaydet</button>
    </form>
  );
}
