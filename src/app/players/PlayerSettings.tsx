'use client';

import { useEffect, useState } from 'react';
import { TIER_OPTIONS } from '@/lib/ui/tier';
import { POSITION_OPTIONS } from '@/lib/ui/position';
import { ToastForm } from '@/components/ToastForm';
import type { ActionResult } from '@/lib/actions/result';
import type { Position } from '@/lib/poll/types';
import type { RatingSummary } from '@/lib/db/ratings';

/**
 * Bir oyuncunun butun ayarlari tek satirda: mevki, sira katmani, listeye
 * dusme saniyesi ve genel yildiz. Kayit satirin sonundaki tek dugmeyle olur.
 *
 * Once her alan kendi basina kaydediyordu: satirda iki ayri "Kaydet" vardi,
 * mevki secer secmez kayit gidiyordu. Alanlar kontrollu tutulur, cunku React
 * form islemi bitince kontrolsuz alanlari sifirliyor ve secim goz onunde eski
 * degerine donuyordu.
 */
export function PlayerSettings({
  action,
  label,
  position,
  tier,
  seconds,
  override,
  summary,
  showRating = true,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  label: string;
  position: Position | null;
  tier: string;
  seconds: number;
  /** Yoneticinin elle yazdigi yildiz; yoksa mac ortalamasi gecerli */
  override: number | null;
  summary: RatingSummary | null;
  showRating?: boolean;
}) {
  const initial = {
    position: position ?? '',
    tier,
    seconds: String(seconds),
    rating: override === null ? '' : String(override),
  };

  const [form, setForm] = useState(initial);

  // Kayittan sonra sunucudan gelen yeni degerlerle esitlenir
  useEffect(() => {
    setForm({
      position: position ?? '',
      tier,
      seconds: String(seconds),
      rating: override === null ? '' : String(override),
    });
  }, [position, tier, seconds, override]);

  const changed =
    form.position !== initial.position ||
    form.tier !== initial.tier ||
    form.seconds !== initial.seconds ||
    form.rating !== initial.rating;

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <ToastForm action={action} className="ml-auto flex shrink-0 items-center gap-1.5">
      <select
        name="position"
        aria-label={`${label} mevkisi`}
        value={form.position}
        onChange={(e) => set('position', e.target.value)}
        className="input input-sm w-24"
      >
        <option value="">Belirtilmedi</option>
        {POSITION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        name="tier"
        aria-label={`${label} sıra katmanı`}
        value={form.tier}
        onChange={(e) => set('tier', e.target.value)}
        className="input input-sm w-28"
      >
        {TIER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {form.tier === 'standard' ? (
        <input type="hidden" name="autoEntrySeconds" value={form.seconds} />
      ) : (
        <>
          <input
            name="autoEntrySeconds"
            type="number"
            min={0}
            max={600}
            value={form.seconds}
            onChange={(e) => set('seconds', e.target.value)}
            aria-label={`${label} — listeye kaçıncı saniyede düşsün`}
            title="Anket açıldıktan kaç saniye sonra girmiş görünsün"
            className="input input-sm w-14"
          />
          <span className="text-xs text-ink-500">sn</span>
        </>
      )}

      {showRating ? (
        <>
          <span className="text-amber-400" aria-hidden>
            ★
          </span>
          <input
            name="rating"
            type="number"
            min={1}
            max={5}
            step="0.1"
            value={form.rating}
            onChange={(e) => set('rating', e.target.value)}
            placeholder={summary ? summary.average.toFixed(1) : '—'}
            aria-label={`${label} genel yıldızı`}
            title={
              override !== null
                ? 'Elle yazıldı; boşaltıp kaydedersen maç ortalamasına döner'
                : `Maç ortalaması${summary ? ` · ${summary.votes} oy` : ''}`
            }
            className="input input-sm w-14"
          />
        </>
      ) : (
        <input type="hidden" name="rating" value={form.rating} />
      )}

      <button className={`btn btn-sm ${changed ? 'btn-primary' : 'btn-ghost'}`}>Kaydet</button>
    </ToastForm>
  );
}
