'use client';

import { useRef, useState } from 'react';
import { ToastForm } from '@/components/ToastForm';
import type { ActionResult } from '@/lib/actions/result';

const STARS = [1, 2, 3, 4, 5];

/**
 * Bes yildiz. Tiklanan yildiz formu kendiliginden gonderir, ayri kaydet
 * dugmesi yoktur. Yildizlar radio oldugu icin klavyeyle de secilebilir.
 *
 * Agirlik kutusu yalnizca sistem sahibine acilir: verdigi oyun kac oy
 * sayilacagini belirler. Diger herkeste her oy bir sayilir.
 */
export function StarRating({
  action,
  value,
  label,
  weight,
  canWeigh = false,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  value: number | null;
  label: string;
  weight?: number;
  canWeigh?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(String(weight ?? 1));

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

      {canWeigh ? (
        <span className="ml-1.5 flex items-center gap-1">
          <input
            name="weight"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            aria-label={`${label}: oy ağırlığı`}
            title="Bu oy kaç oy sayılsın"
            className="input input-sm w-12"
          />
          {/* Yildiza tiklamak formu gonderir; yalnizca agirligi degistirmek
              isteyen icin ayri bir dugme gerekiyor */}
          <button
            type="submit"
            disabled={!value}
            title="Ağırlığı kaydet"
            className="btn btn-ghost btn-sm"
          >
            oy
          </button>
        </span>
      ) : (
        <input type="hidden" name="weight" value="1" />
      )}
    </ToastForm>
  );
}
