import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { getSquad } from '@/lib/db/squad';
import { formatKickoff, formatShort, type MatchStatus } from '@/lib/ui/format';
import { isMailConfigured } from '@/lib/mail';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  LEDGER_CATEGORY_LABELS,
  money,
  type LedgerCategory,
} from '@/lib/ui/ledger';
import {
  addMatchLedgerEntry,
  completeMatch,
  deleteMatchLedgerEntry,
  reopenPayments,
  savePaymentAmount,
  sendPaymentReminder,
  setPayment,
} from './actions';

type LedgerRow = {
  id: string;
  direction: 'income' | 'expense';
  category: LedgerCategory;
  amount: number;
  description: string;
};

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServerSupabase();
  const { data: match, error } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, fee_per_player, payment_reminder_sent_at')
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!match) notFound();

  const status = match.status as MatchStatus;
  const fee = Number(match.fee_per_player ?? 0);
  const squad = await getSquad(matchId);

  const collected = squad.reduce((sum, m) => sum + m.amountPaid, 0);
  const expected = fee * squad.length;
  const unpaid = squad.filter((m) => m.amountPaid < fee);
  const isClosed = status === 'completed';

  // Bu haftanin oyuncu odemesi disindaki gelir ve giderleri
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('ledger_entries')
    .select('id, direction, category, amount, description')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });
  if (ledgerError) throw new Error(ledgerError.message);

  const ledger = (ledgerRows ?? []).map((r) => ({
    ...r,
    amount: Number(r.amount),
  })) as unknown as LedgerRow[];

  const otherIncome = ledger
    .filter((r) => r.direction === 'income')
    .reduce((sum, r) => sum + r.amount, 0);
  const weekExpense = ledger
    .filter((r) => r.direction === 'expense')
    .reduce((sum, r) => sum + r.amount, 0);
  const weekBalance = collected + otherIncome - weekExpense;

  // Hatirlatma mac saatinden 24 saat sonra gonderilebilir
  const kickoffTime = new Date(match.kickoff_at as string).getTime();
  const reminderOpensAt = new Date(kickoffTime + 24 * 60 * 60 * 1000);
  const canRemind = Date.now() >= reminderOpensAt.getTime();
  const reminderSentAt = (match.payment_reminder_sent_at as string | null) ?? null;
  const unpaidWithMail = unpaid.filter((m) => m.email);
  const unpaidWithoutMail = unpaid.filter((m) => !m.email);
  const mailReady = isMailConfigured();

  return (
    <AppShell
      profile={profile}
      title="Ödemeler"
      subtitle={`${formatKickoff(match.kickoff_at as string)} · ${match.venue || 'Saha belirtilmedi'}`}
      action={
        isClosed ? (
          <span className="badge badge-live">Muhasebe kapandı</span>
        ) : (
          <span className="badge badge-muted">{unpaid.length} kişi ödemedi</span>
        )
      }
    >
      {squad.length === 0 ? (
        <div className="card card-pad flex flex-col items-start gap-3 text-sm text-ink-300">
          <p>Bu maçın kadrosu henüz kesinleşmedi. Ödeme, kadrodaki kişiler için tutulur.</p>
          <Link href={`/poll/${matchId}`} className="btn btn-ghost btn-sm">
            Ankete dön
          </Link>
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="card card-pad">
              <p className="text-xs uppercase tracking-wide text-ink-300">Toplanan</p>
              <p className="mt-1 text-lg font-semibold text-frost-100">{money(collected)}</p>
              <p className="mt-0.5 text-xs text-ink-500">Beklenen {money(expected)}</p>
            </div>
            <div className="card card-pad">
              <p className="text-xs uppercase tracking-wide text-ink-300">Kalan</p>
              <p className="mt-1 text-lg font-semibold text-frost-100">
                {money(Math.max(expected - collected, 0))}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">{unpaid.length} kişi ödemedi</p>
            </div>
            <div className="card card-pad">
              <p className="text-xs uppercase tracking-wide text-ink-300">Kişi başı</p>
              <p className="mt-1 text-lg font-semibold text-frost-100">{money(fee)}</p>
              <p className="mt-0.5 text-xs text-ink-500">{squad.length} kişilik kadro</p>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="section-title">Bu haftanın gelir ve giderleri</h2>

            <div className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-300">Hafta kasası</p>
                  <p
                    className={`mt-1 text-lg font-semibold ${
                      weekBalance < 0 ? 'text-red-300' : 'text-frost-100'
                    }`}
                  >
                    {money(weekBalance)}
                  </p>
                </div>
                <p className="text-xs text-ink-500">
                  Oyunculardan {money(collected)} · diğer gelir {money(otherIncome)} · gider{' '}
                  {money(weekExpense)}
                </p>
              </div>

              {ledger.length > 0 && (
                <ul className="divide-line mt-3 border-t border-[color:var(--line)]">
                  {ledger.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-frost-100">
                          {LEDGER_CATEGORY_LABELS[row.category]}
                        </div>
                        <div className="truncate text-xs text-ink-500">
                          {row.description || 'Açıklama yok'}
                        </div>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          row.direction === 'income' ? 'text-emerald-300' : 'text-red-300'
                        }`}
                      >
                        {row.direction === 'income' ? '+' : '−'}
                        {money(row.amount)}
                      </span>
                      <form action={deleteMatchLedgerEntry.bind(null, matchId, row.id)}>
                        <button className="text-xs text-ink-500 underline">Sil</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <form
                action={addMatchLedgerEntry.bind(null, matchId)}
                className="mt-3 flex flex-wrap items-end gap-2 border-t border-[color:var(--line)] pt-3"
              >
                <div className="field min-w-[10rem] flex-1">
                  <label className="label" htmlFor="category">
                    Kalem
                  </label>
                  <select id="category" name="category" defaultValue="field_fee" className="input">
                    <optgroup label="Gelir">
                      {INCOME_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {LEDGER_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Gider">
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {LEDGER_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="field w-28">
                  <label className="label" htmlFor="amount">
                    Tutar (₺)
                  </label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    className="input"
                  />
                </div>

                <div className="field min-w-[12rem] flex-1">
                  <label className="label" htmlFor="description">
                    Açıklama
                  </label>
                  <input
                    id="description"
                    name="description"
                    type="text"
                    maxLength={200}
                    placeholder="Örn. 2 numaralı saha, su ve meyve"
                    className="input"
                  />
                </div>

                <button className="btn btn-ghost btn-sm">Ekle</button>
              </form>

              <p className="hint mt-2">
                Oyunculardan toplanan parayı buraya yazma; o, aşağıdaki kadro listesinden geliyor.
                Kayıt bu maça ve macin tarihine bağlanır, muhasebede hafta hafta görünür.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="section-title">Kadro</h2>

            <ul className="card divide-line">
              {squad.map((m) => {
                const isPaid = m.amountPaid >= fee && fee > 0;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-frost-100">
                        {m.fullName}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {isPaid ? (
                          <span className="badge badge-live">Ödedi</span>
                        ) : m.amountPaid > 0 ? (
                          <span className="badge badge-vip">Eksik · {money(m.amountPaid)}</span>
                        ) : (
                          <span className="badge badge-muted">Ödemedi</span>
                        )}
                        {m.isGuest && !m.isRegular && (
                          <span className="badge badge-muted">Aday</span>
                        )}
                      </div>
                    </div>

                    <form
                      action={savePaymentAmount.bind(null, matchId, m.id)}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        name="amount"
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={m.amountPaid || ''}
                        placeholder={String(fee)}
                        aria-label={`${m.fullName} ödediği tutar`}
                        className="input input-sm w-24"
                      />
                      <button className="btn btn-ghost btn-sm">Kaydet</button>
                    </form>

                    {isPaid ? (
                      <form action={setPayment.bind(null, matchId, m.id, 0)}>
                        <button className="btn btn-ghost btn-sm">Geri al</button>
                      </form>
                    ) : (
                      <form action={setPayment.bind(null, matchId, m.id, fee)}>
                        <button className="btn btn-go btn-sm">Ödedi</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="section-title">Ödeme hatırlatması</h2>

            <div className="card card-pad flex flex-col gap-3">
              {!mailReady ? (
                <p className="text-sm text-ink-300">
                  E-posta ayarları henüz tanımlı değil. Gönderim için{' '}
                  <strong>SMTP_HOST</strong>, <strong>SMTP_USER</strong> ve{' '}
                  <strong>SMTP_PASS</strong> ortam değişkenlerini eklemek gerekiyor.
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-300">
                    Ödemesi eksik olanlara mail gider; bilgi (CC) olarak yöneticiler eklenir.
                    {reminderSentAt
                      ? ` Son gönderim: ${formatShort(reminderSentAt)}.`
                      : canRemind
                        ? ' Maçın üzerinden 24 saat geçti, gönderebilirsin.'
                        : ` ${formatShort(reminderOpensAt.toISOString())} tarihinden sonra gönderilebilir.`}
                  </p>

                  <p className="hint">
                    {unpaidWithMail.length} kişiye gidecek
                    {unpaidWithoutMail.length > 0
                      ? ` · ${unpaidWithoutMail.length} kişinin e-posta adresi yok (üye değil), onlara mail gitmez`
                      : ''}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <form action={sendPaymentReminder.bind(null, matchId, false)}>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!canRemind || unpaidWithMail.length === 0 || Boolean(reminderSentAt)}
                      >
                        Hatırlatma gönder
                      </button>
                    </form>

                    {reminderSentAt && (
                      <form action={sendPaymentReminder.bind(null, matchId, true)}>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={unpaidWithMail.length === 0}
                        >
                          Tekrar gönder
                        </button>
                      </form>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="section-title">Muhasebeyi kapat</h2>

            {isClosed ? (
              <form action={reopenPayments.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
                <p className="text-sm text-ink-300">
                  Bu maçın muhasebesi kapandı. Geri açarsan maç yeniden &quot;Oynandı&quot;
                  durumuna döner, ödeme kayıtları olduğu gibi kalır.
                </p>
                <button className="btn btn-ghost btn-sm self-start">Muhasebeyi geri aç</button>
              </form>
            ) : (
              <form action={completeMatch.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
                <p className="text-sm text-ink-300">
                  Herkes ödedikten sonra maçı kapat: durumu &quot;Tamamlandı&quot; olur. Skor ve
                  puan durumu bundan etkilenmez.
                </p>
                <p className="hint">
                  {status !== 'played'
                    ? 'Kapatmak için önce skoru gir.'
                    : unpaid.length > 0
                      ? `${unpaid.length} kişinin ödemesi eksik.`
                      : 'Bütün ödemeler tamam.'}
                </p>
                <button
                  className="btn btn-primary btn-sm self-start"
                  disabled={status !== 'played' || unpaid.length > 0}
                >
                  Ödemeleri kapat
                </button>
              </form>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
