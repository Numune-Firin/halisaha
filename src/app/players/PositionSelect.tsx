'use client';

import { useRef } from 'react';
import { POSITION_OPTIONS } from '@/lib/ui/position';

/**
 * Mevki secimi. Ayri bir "kaydet" dugmesi yerine secim degisir degismez formu
 * gonderir: listede onlarca satir var, her biri icin dugme gurultu olurdu.
 */
export function PositionSelect({
  action,
  value,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  value: string | null;
  /** Ekran okuyucu icin: hangi oyuncunun mevkisi oldugu satir disinda anlasilmaz. */
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <select
        name="position"
        aria-label={`${label} mevkisi`}
        defaultValue={value ?? ''}
        onChange={() => formRef.current?.requestSubmit()}
        className="input input-sm w-36"
      >
        <option value="">Belirtilmedi</option>
        {POSITION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
