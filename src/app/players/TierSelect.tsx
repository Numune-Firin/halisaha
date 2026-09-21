'use client';

import { useEffect, useState } from 'react';
import { TIER_OPTIONS } from '@/lib/ui/tier';
import { ToastForm } from '@/components/ToastForm';
import type { ActionResult } from '@/lib/actions/result';

/**
 * Siralama katmani ve "kacinci saniyede listeye dussun" degeri.
 *
 * Sabit (VIP) ve oncelikli oyuncular anket acilir acilmaz listeye yazilir.
 * Hepsi tam anket saniyesinde gorunmesin diye her oyuncuya kucuk bir gecikme
 * verilebilir: 3 sn, 5 sn...
 *
 * Alanlar kontrollu, kayit "Kaydet" ile yapilir. Secim degisir degismez
 * gondermek ise yaramiyordu: React form islemi bitince kontrolsuz alanlari
 * sifirliyor, kutu goz onunde "Normal"a donuyor ve saniye yazilamiyordu.
 */
export function TierSelect({
  action,
  value,
  seconds,
  label,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  value: string;
  seconds: number;
  label: string;
}) {
  const [tier, setTier] = useState(value);
  const [delay, setDelay] = useState(String(seconds));

  // Kayittan sonra sunucudan gelen yeni degerlerle esitlenir
  useEffect(() => {
    setTier(value);
    setDelay(String(seconds));
  }, [value, seconds]);

  const changed = tier !== value || delay !== String(seconds);

  return (
    <ToastForm action={action} className="flex items-center gap-1.5">
      <select
        name="tier"
        aria-label={`${label} sıra katmanı`}
        value={tier}
        onChange={(e) => setTier(e.target.value)}
        className="input input-sm w-32"
      >
        {TIER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {tier === 'standard' ? (
        <input type="hidden" name="autoEntrySeconds" value={delay} />
      ) : (
        <>
          <input
            name="autoEntrySeconds"
            type="number"
            min={0}
            max={600}
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            aria-label={`${label} — listeye kaçıncı saniyede düşsün`}
            title="Anket açıldıktan kaç saniye sonra girmiş görünsün"
            className="input input-sm w-16"
          />
          <span className="text-xs text-ink-500">sn</span>
        </>
      )}

      <button className={`btn btn-sm ${changed ? 'btn-primary' : 'btn-ghost'}`}>Kaydet</button>
    </ToastForm>
  );
}
