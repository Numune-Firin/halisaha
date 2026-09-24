'use client';

import { useMemo, useState, useTransition } from 'react';
import { ToastForm } from '@/components/ToastForm';
import { useToast } from '@/components/Toast';
import { money } from '@/lib/ui/ledger';
import { formatStamp } from '@/lib/ui/format';
import { savePaymentAmount, setPayment, setPaymentsBulk, setPaymentsToDue } from './actions';

/**
 * Kadro odemeleri.
 *
 * Tek tek isaretlemek on dort kiside yoruyordu; satirlarin yanindaki kutucukla
 * birden fazla kisi secilip tek hamlede "odedi" (ya da geri alma) yapilabilir.
 * Tek kisilik islemler eskisi gibi satirin kendi butonlarindan yapilir.
 *
 * Beklenen tutar herkeste ayni degildir: onceki haftalardan alacagi olan
 * oyuncunun borcu once o alacaktan dusulur, kalani nakit odenir. Satirda hem
 * odemesi gereken tutar hem de alacagindan ne kadar dustugu yazar.
 */

export interface PaymentRow {
  id: string;
  fullName: string;
  amountPaid: number;
  /** Alacagi dusuldukten sonra nakit odemesi gereken tutar */
  due: number;
  /** Haftanin ucretinin alacaktan karsilanan kismi */
  creditUsed: number;
  /** Gecmis borcundan bu haftanin ucretine eklenen tutar */
  debtAdded: number;
  /** Listeye girdigi an; ankete girmeden kadroya yazilanlarda bos */
  enteredAt: string | null;
  isGuest: boolean;
  isRegular: boolean;
}

export function SquadPayments({
  matchId,
  squad,
  locked = false,
}: {
  matchId: string;
  squad: PaymentRow[];
  /** Muhasebe kapandiysa yalnizca okunur; once geri acmak gerekir */
  locked?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const { show } = useToast();

  // Borcu kapandiysa odedi sayilir: kimi nakit oder, kiminin borcu alacagindan
  // duser ve hic nakit vermez
  const isPaid = useMemo(() => (row: PaymentRow) => row.amountPaid >= row.due, []);

  const unpaidIds = squad.filter((m) => !isPaid(m)).map((m) => m.id);
  const allSelected = selected.length === squad.length && squad.length > 0;

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  function applyDue() {
    const ids = selected;
    startTransition(async () => {
      const result = await setPaymentsToDue(matchId, ids);
      show(result.message, result.ok);
      if (result.ok) setSelected([]);
    });
  }

  function clearPayments() {
    const ids = selected;
    startTransition(async () => {
      const result = await setPaymentsBulk(matchId, ids, 0);
      show(result.message, result.ok);
      if (result.ok) setSelected([]);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Kadro</h2>

      {locked ? (
        <p className="hint">
          Muhasebe kapandığı için ödemeler kilitli. Değiştirmek için aşağıdan
          <strong> Muhasebeyi geri aç</strong>.
        </p>
      ) : (
      <div className="card card-pad flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? squad.map((m) => m.id) : [])}
            className="h-4 w-4 accent-[var(--color-azure-400)]"
          />
          Tümünü seç
        </label>

        <button
          type="button"
          onClick={() => setSelected(unpaidIds)}
          disabled={unpaidIds.length === 0}
          className="btn btn-ghost btn-sm"
        >
          Ödemeyenleri seç ({unpaidIds.length})
        </button>

        <span className="hint ml-auto">
          {selected.length > 0 ? `${selected.length} kişi seçili` : 'Kimse seçilmedi'}
        </span>

        <button
          type="button"
          onClick={applyDue}
          disabled={selected.length === 0 || pending}
          className="btn btn-go btn-sm"
        >
          Seçilenler ödedi
        </button>

        <button
          type="button"
          onClick={clearPayments}
          disabled={selected.length === 0 || pending}
          className="btn btn-ghost btn-sm"
        >
          Ödemeyi geri al
        </button>
      </div>
      )}

      <ul className="card divide-line">
        {squad.map((m) => {
          const paid = isPaid(m);
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              {!locked && (
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={(e) => toggle(m.id, e.target.checked)}
                  aria-label={`${m.fullName} seç`}
                  className="h-4 w-4 accent-[var(--color-azure-400)]"
                />
              )}

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-frost-100">{m.fullName}</div>
                {m.enteredAt && (
                  <div className="text-xs text-ink-500">{formatStamp(m.enteredAt)}</div>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {paid ? (
                    <span className="badge badge-live">
                      {m.due === 0 && m.creditUsed > 0 ? 'Alacağından düştü' : 'Ödedi'}
                    </span>
                  ) : m.amountPaid > 0 ? (
                    <span className="badge badge-vip">
                      Eksik · {money(m.amountPaid)} / {money(m.due)}
                    </span>
                  ) : (
                    <span className="badge badge-muted">{money(m.due)} ödemeli</span>
                  )}
                  {m.creditUsed > 0 && (
                    <span
                      className="badge badge-vip"
                      title="Önceki haftalardan kalan alacağından düşüldü"
                    >
                      Alacağından −{money(m.creditUsed)}
                    </span>
                  )}
                  {m.debtAdded > 0 && (
                    <span
                      className="badge badge-danger"
                      title="Önceki haftalardan kalan borcu bu haftanın ücretine eklendi"
                    >
                      Eski borç +{money(m.debtAdded)}
                    </span>
                  )}
                  {m.isGuest && !m.isRegular && <span className="badge badge-muted">Aday</span>}
                </div>
              </div>

              {locked ? (
                <span className="text-sm text-ink-300">{money(m.amountPaid)}</span>
              ) : (
                <>
              <ToastForm
                action={savePaymentAmount.bind(null, matchId, m.id)}
                className="flex items-center gap-1.5"
              >
                <input
                  name="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={m.amountPaid || ''}
                  placeholder={String(m.due)}
                  aria-label={`${m.fullName} ödediği tutar`}
                  className="input input-sm w-24"
                />
                <button className="btn btn-ghost btn-sm">Kaydet</button>
              </ToastForm>

              {paid ? (
                <ToastForm action={setPayment.bind(null, matchId, m.id, 0)}>
                  <button className="btn btn-ghost btn-sm">Geri al</button>
                </ToastForm>
              ) : (
                <ToastForm action={setPayment.bind(null, matchId, m.id, m.due)}>
                  <button className="btn btn-go btn-sm">Ödedi</button>
                </ToastForm>
              )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
