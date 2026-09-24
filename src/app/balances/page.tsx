import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getCurrentProfile } from '@/lib/supabase/server';
import { getConversions, getCreditEvents } from '@/lib/db/credit';
import { summarizeAccounts, totalCredit, totalDebt } from '@/lib/accounting/credit';
import { formatShort, formatStamp } from '@/lib/ui/format';
import { money } from '@/lib/ui/ledger';
import { ToastForm } from '@/components/ToastForm';
import { convertCredit, deleteConversion } from './actions';

const CONVERSION_LABELS = {
  donation: 'Bağış',
  refreshment: 'İkram katkısı',
} as const;

/**
 * Oyuncu bakiyeleri.
 *
 * Hafta ucretinden fazla odeyen oyuncu ligden alacakli olur, eksik odeyen
 * borclu kalir; iki durum da sonraki haftanin ucretine yansir. Ekran butun
 * uyelere aciktir (kim alacakli kim borclu herkes gorsun), ama alacagi bagisa
 * cevirmek ve kaydi geri almak yalnizca yoneticinin isidir.
 */
export default async function BalancesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const isAdmin = profile.role === 'admin';

  const [events, conversions] = await Promise.all([getCreditEvents(), getConversions()]);
  const accounts = summarizeAccounts(events);

  const credit = totalCredit(accounts);
  const debt = totalDebt(accounts);
  const creditors = accounts.filter((a) => a.balance > 0);
  const debtors = accounts.filter((a) => a.balance < 0);

  return (
    <AppShell
      profile={profile}
      title="Oyuncu bakiyeleri"
      subtitle="Fazla ödeyen alacaklı olur, eksik ödeyen borçlu kalır; ikisi de sonraki haftaya yansır."
      action={
        isAdmin ? (
          <Link href="/admin/accounting" className="btn btn-ghost btn-sm">
            Muhasebe
          </Link>
        ) : undefined
      }
    >
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card card-pad">
          <p className="text-xs uppercase tracking-wide text-ink-300">Oyuncuların alacağı</p>
          <p className="mt-1 text-lg font-semibold text-emerald-300">{money(credit)}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {creditors.length} kişi · kasada duruyor, onlara ait
          </p>
        </div>
        <div className="card card-pad">
          <p className="text-xs uppercase tracking-wide text-ink-300">Oyuncuların borcu</p>
          <p className="mt-1 text-lg font-semibold text-red-300">{money(debt)}</p>
          <p className="mt-0.5 text-xs text-ink-500">{debtors.length} kişide açık var</p>
        </div>
        <div className="card card-pad">
          <p className="text-xs uppercase tracking-wide text-ink-300">Net</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              credit - debt > 0 ? 'text-frost-100' : 'text-red-300'
            }`}
          >
            {money(credit - debt)}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">Alacak − borç</p>
        </div>
      </section>

      <p className="hint">
        Kural tek: <strong>o hafta ödenecek tutar = hafta ücreti − önceki bakiye</strong>.
        600 ₺&apos;lik haftaya 1.700 ₺ ödeyen 1.100 ₺ alacaklı olur; ertesi hafta hiç ödemez
        (alacağı 500 ₺&apos;ye iner), ondan sonraki hafta yalnızca 100 ₺ öder. 600 ₺ yerine 200 ₺
        ödeyen 400 ₺ borçlu kalır; ertesi hafta 1.000 ₺ ödemesi gerekir. İptal edilen haftada
        borç doğmaz, o hafta için alınmış para alacağa yazılır.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Hesaplar <span className="badge badge-muted">{accounts.length}</span>
        </h2>

        {accounts.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Henüz kadrosu kesinleşmiş maç yok; hesap dökümü ilk haftayla birlikte oluşur.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {accounts.map((account) => (
              <details key={account.personId} className="card">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-frost-100">
                      {account.fullName}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {account.matchCount} maç · {money(account.paid)} ödedi ·{' '}
                      {money(account.charged)} borçlandı
                      {account.creditUsed > 0 ? ` · ${money(account.creditUsed)} alacaktan` : ''}
                      {account.debtCarried > 0 ? ` · ${money(account.debtCarried)} eski borç` : ''}
                      {account.donated > 0 ? ` · ${money(account.donated)} bağışladı` : ''}
                    </div>
                  </div>

                  {account.balance > 0 ? (
                    <span className="badge badge-live">{money(account.balance)} alacaklı</span>
                  ) : account.balance < 0 ? (
                    <span className="badge badge-danger">{money(-account.balance)} borçlu</span>
                  ) : (
                    <span className="badge badge-muted">Temiz</span>
                  )}
                </summary>

                <div className="flex flex-col gap-3 border-t border-[color:var(--line)] px-4 py-3">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-ink-300">
                          <th className="px-2 py-1.5 text-left">Tarih</th>
                          <th className="px-2 py-1.5 text-left">Hareket</th>
                          <th className="px-2 py-1.5 text-right">Borç</th>
                          <th className="px-2 py-1.5 text-right">Ödenen</th>
                          <th className="px-2 py-1.5 text-right">Bakiye</th>
                        </tr>
                      </thead>
                      <tbody className="divide-line">
                        {account.events.map((event, index) => {
                          const creditUsed = Math.max(0, event.charged - event.due);
                          const debtAdded = Math.max(0, event.due - event.charged);
                          return (
                            <tr key={`${event.matchId ?? 'c'}-${index}`}>
                              <td className="whitespace-nowrap px-2 py-1.5 text-ink-300">
                                {formatShort(event.occurredAt)}
                              </td>
                              <td className="px-2 py-1.5">
                                {event.kind === 'conversion' ? (
                                  <span className="text-frost-100">
                                    {CONVERSION_LABELS[
                                      (event.category as 'donation' | 'refreshment') ?? 'donation'
                                    ]}
                                    {event.note ? ` · ${event.note}` : ''}
                                  </span>
                                ) : (
                                  <span className="text-frost-100">
                                    {event.matchStatus === 'cancelled' ? 'İptal hafta' : 'Hafta'}
                                    {event.matchId && (
                                      <Link
                                        href={`/poll/${event.matchId}/payments`}
                                        className="ml-2 text-xs text-azure-400 underline"
                                      >
                                        ödemeler
                                      </Link>
                                    )}
                                  </span>
                                )}
                                {creditUsed > 0 && event.kind === 'match' && (
                                  <span className="badge badge-vip ml-2">
                                    Alacaktan −{money(creditUsed)}
                                  </span>
                                )}
                                {debtAdded > 0 && event.kind === 'match' && (
                                  <span className="badge badge-danger ml-2">
                                    Eski borç +{money(debtAdded)}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-2 py-1.5 text-right text-ink-300">
                                {event.charged > 0 ? money(event.charged) : '—'}
                              </td>
                              <td className="whitespace-nowrap px-2 py-1.5 text-right text-ink-300">
                                {event.paid > 0 ? money(event.paid) : '—'}
                              </td>
                              <td
                                className={`whitespace-nowrap px-2 py-1.5 text-right font-semibold ${
                                  event.balanceAfter < 0 ? 'text-red-300' : 'text-emerald-300'
                                }`}
                              >
                                {money(event.balanceAfter)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Oyuncu "kalsin, ikram olsun" derse alacagi buradan kapatilir */}
                  {isAdmin && account.balance > 0 && (
                    <ToastForm
                      action={convertCredit.bind(null, account.personId, account.isGuest)}
                      className="flex flex-wrap items-end gap-2 border-t border-[color:var(--line)] pt-3"
                    >
                      <div className="field w-28">
                        <label className="label" htmlFor={`amount-${account.personId}`}>
                          Tutar (₺)
                        </label>
                        <input
                          id={`amount-${account.personId}`}
                          name="amount"
                          type="number"
                          min={1}
                          max={account.balance}
                          step="0.01"
                          required
                          placeholder={String(account.balance)}
                          className="input"
                        />
                      </div>

                      <div className="field w-40">
                        <label className="label" htmlFor={`category-${account.personId}`}>
                          Ne olarak
                        </label>
                        <select
                          id={`category-${account.personId}`}
                          name="category"
                          defaultValue="donation"
                          className="input"
                        >
                          <option value="donation">Bağış</option>
                          <option value="refreshment">İkram katkısı</option>
                        </select>
                      </div>

                      <div className="field min-w-[12rem] flex-1">
                        <label className="label" htmlFor={`note-${account.personId}`}>
                          Açıklama
                        </label>
                        <input
                          id={`note-${account.personId}`}
                          name="note"
                          type="text"
                          maxLength={200}
                          placeholder="Örn. kalanı ikram olsun dedi"
                          className="input"
                        />
                      </div>

                      <button className="btn btn-ghost btn-sm">Alacaktan düş</button>
                    </ToastForm>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Bağışa çevrilen alacaklar <span className="badge badge-muted">{conversions.length}</span>
        </h2>

        <p className="hint">
          Bu tutarlar kasaya yeniden gelir yazmaz; para zaten oyuncu ödemesi olarak kasaya
          girmişti. Buradaki kayıt yalnızca &quot;artık oyuncunun alacağı değil&quot; demektir.
        </p>

        {conversions.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">Henüz çevrilen alacak yok.</div>
        ) : (
          <ul className="card divide-line">
            {conversions.map((conversion) => (
              <li key={conversion.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-frost-100">
                    {conversion.fullName}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-500">
                    {formatStamp(conversion.createdAt)} · {CONVERSION_LABELS[conversion.category]}
                    {conversion.note ? ` · ${conversion.note}` : ''}
                  </div>
                </div>

                <span className="text-sm font-semibold text-emerald-300">
                  {money(conversion.amount)}
                </span>

                {isAdmin && (
                  <ToastForm action={deleteConversion.bind(null, conversion.id)}>
                    <button
                      className="text-xs text-ink-500 underline"
                      title="Kaydı kaldırır, tutar oyuncunun alacağına geri döner"
                    >
                      Geri al
                    </button>
                  </ToastForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
