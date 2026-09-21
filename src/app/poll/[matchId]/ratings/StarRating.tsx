'use client';

import { useRef } from 'react';
import { ToastForm } from '@/components/ToastForm';
import type { ActionResult } from '@/lib/actions/result';

const STARS = [1, 2, 3, 4, 5];

/**
 * Bes yildiz. Tiklanan yildiz formu kendiliginden gonderir, ayri kaydet
 * dugmesi yoktur. Yildizlar radio oldugu icin klavyeyle de secilebilir.
 */
export function StarRating({
  action,
  value,
  label,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  value: number | null;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <ToastForm ref={formRef} action={action} className="flex items-center gap-0.5">
      {STARS.map((star) => (
        <label
          key={star}
          title={`${star} yıldız`}
          className={`star ${value && star <= value ? 'star-on' : ''}`}
        >
          <input
            type="radio"
            name="stars"
            value={star}
            defaultChecked={value === star}
            onChange={() => formRef.current?.requestSubmit()}
            aria-label={`${label}: ${star} yıldız`}
            className="sr-only"
          />
          ★
        </label>
      ))}
    </ToastForm>
  );
}
