'use client';

import { useState } from 'react';

export type PickerPerson = { id: string; fullName: string; isGuest: boolean };

/**
 * Kadro secimi. Kontenjan dolmadan "kesinleştir" butonu acilmaz; ayni kural
 * veritabanindaki lock_squad fonksiyonunda da vardir, buradaki kontrol
 * yalnizca kullaniciya anlik geri bildirim icindir.
 */
export function SquadPicker({
  people,
  preselectedIds,
  squadSize,
  action,
}: {
  people: PickerPerson[];
  preselectedIds: string[];
  squadSize: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(preselectedIds);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  const count = selected.length;
  const isReady = count === squadSize;

  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="card divide-line">
        {people.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
              <input
                type="checkbox"
                name={p.isGuest ? 'guest' : 'player'}
                value={p.id}
                checked={selected.includes(p.id)}
                onChange={(e) => toggle(p.id, e.target.checked)}
                className="h-4 w-4 accent-[var(--color-gold-400)]"
              />
              <span className="flex-1 text-sm text-ink-100">
                {p.fullName || 'İsimsiz oyuncu'}
              </span>
              {p.isGuest && <span className="badge badge-muted">Aday</span>}
            </label>
          </li>
        ))}
      </ul>

      <div className="card card-pad flex items-center justify-between text-sm">
        <span className="text-ink-300">Seçili</span>
        <span className={isReady ? 'font-semibold text-cream-100' : 'font-semibold text-gold-400'}>
          {count}/{squadSize}
        </span>
      </div>

      <button type="submit" disabled={!isReady} className="btn btn-primary btn-block">
        Kadroyu kesinleştir
      </button>

      {!isReady && (
        <p className="hint text-center">
          {count < squadSize
            ? `Kadro dolmadan kesinleştirilemez. ${squadSize - count} kişi daha gerekli.`
            : `${count - squadSize} kişi fazla seçili.`}
        </p>
      )}
    </form>
  );
}
