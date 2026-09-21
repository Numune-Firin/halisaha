'use client';

import { useEffect, useRef, useState } from 'react';
import { POSITION_OPTIONS } from '@/lib/ui/position';
import { ToastForm } from '@/components/ToastForm';
import type { ActionResult } from '@/lib/actions/result';

/**
 * Mevki secimi. Ayri bir "kaydet" dugmesi yerine secim degisir degismez formu
 * gonderir: listede onlarca satir var, her biri icin dugme gurultu olurdu.
 *
 * Alan kontrollu tutulur; React form islemi bittiginde kontrolsuz alanlari
 * sifirladigi icin secim bir an eski degerine donuyordu.
 */
export function PositionSelect({
  action,
  value,
  label,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  value: string | null;
  /** Ekran okuyucu icin: hangi oyuncunun mevkisi oldugu satir disinda anlasilmaz. */
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [position, setPosition] = useState(value ?? '');

  useEffect(() => setPosition(value ?? ''), [value]);

  return (
    <ToastForm ref={formRef} action={action}>
      <select
        name="position"
        aria-label={`${label} mevkisi`}
        value={position}
        onChange={(e) => {
          setPosition(e.target.value);
          formRef.current?.requestSubmit();
        }}
        className="input input-sm w-36"
      >
        <option value="">Belirtilmedi</option>
        {POSITION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </ToastForm>
  );
}
