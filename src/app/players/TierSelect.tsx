'use client';

import { useRef } from 'react';
import { TIER_OPTIONS } from '@/lib/ui/tier';

/**
 * Siralama katmani secimi. Mevki kutusu gibi, secim degisir degismez kaydeder.
 */
export function TierSelect({
  action,
  value,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  value: string;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <select
        name="tier"
        aria-label={`${label} sıra katmanı`}
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        className="input input-sm w-32"
      >
        {TIER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
