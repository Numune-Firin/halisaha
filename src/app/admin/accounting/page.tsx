import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { formatDay, formatKickoff, type MatchStatus } from '@/lib/ui/format';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  LEDGER_CATEGORY_LABELS,
  money,
  type LedgerCategory,
} from '@/lib/ui/ledger';
import { dayKey, groupByDay, type CashMovement } from '@/lib/ui/cashflow';
import { createAdjustmentEntry, deleteEntry, reverseEntry } from './actions';
import { ToastForm } from '@/components/ToastForm';


type MatchRow = {
  id: string;
  kickoff_at: string;
  venue: string;
  status: MatchStatus;
  fee_per_player: number;
  sponsor_name: string;
};

type LedgerRow = {
  id: string;
  match_id: string | null;
  reverses_id: string | null;
  reversed_at: string | null;
  direction: 'income' | 'expense';
  category: LedgerCategory;
  amount: number;
  description: string;
  occurred_on: string;
};

type SquadRow = {
  match_id: string;
  amount_paid: number;
  paid_at: string | null;
  player_id: string | null;
  guest_id: string | null;
  profiles: { full_name: string } | null;
  guest_players: { full_name: string } | null;
};

/**
 * Sezonun parasi tek ekranda: mac basina toplanan/beklenen ve kisi basina
 * borc. Ayri bir muhasebe tablosu tutulmaz; her sey kadro satirlarindaki
 * odeme kayitlarindan turetilir, boylece bir odeme duzeltilince ozet de
 * kendiliginden duzelir.
 */
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const { season: seasonParam } = await searchParams;
  const supabase = await createServerSupabase();

  const { data: seasons, error: seasonError } = await supabase
    .from('seasons')
    .select('id, name, is_active')
    .order('starts_on', { ascending: false });
  if (seasonError) throw new Error(seasonError.message);

  const seasonList = seasons ?? [];
  const activeSeason = seasonList.find((s) => s.is_active) ?? seasonList[0];
  const seasonId = seasonParam ?? (activeSeason?.id as string | undefined);

  if (!seasonId) {
    return (
      <AppShell profile={profile} title="Muhasebe" subtitle="Sezonun para özeti.">
        <div className="card card-pad text-sm text-ink-300">
          Önce bir sezon tanımla; muhasebe sezona göre hesaplanır.
        </div>
      </AppShell>
    );
  }

  // Iptal edilen hafta parasal olarak yoktur: ne oyuncu odemesi ne de o
  // haftaya yazilmis gelir/gider kasaya girer.
  const { data: cancelledRows } = await supabase
    .from('matches')
    .select('id')
    .eq('season_id', seasonId)
    .eq('status', 'cancelled');
  const cancelledIds = new Set((cancelledRows ?? []).map((m) => m.id as string));

  const { data: matchRows, error: matchError } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, fee_per_player, sponsor_name')
    .eq('season_id', seasonId)
    .in('status', ['squad_locked', 'played', 'completed'])
    .order('kickoff_at', { ascending: false });
  if (matchError) throw new Error(matchError.message);

  const matches = (matchRows ?? []) as unknown as MatchRow[];
  const feeById = new Map(matches.map((m) => [m.id, Number(m.fee_per_player ?? 0)]));

  let squad: SquadRow[] = [];
  if (matches.length > 0) {
    const { data: squadRows, error: squadError } = await supabase
      .from('match_squad')
      .select(
        'match_id, amount_paid, paid_at, player_id, guest_id, profiles(full_name), guest_players(full_name)',
      )
      .in(
        'match_id',
        matches.map((m) => m.id),
      );
    if (squadError) throw new Error(squadError.message);
    squad = (squadRows ?? []) as unknown as SquadRow[];
  }

  const perMatch = new Map<string, { collected: number; expected: number; unpaid: number }>();
  const perPerson = new Map<
    string,
    { name: string; isGuest: boolean; played: number; due: number; paid: number }
  >();

  for (const row of squad) {
    const fee = feeById.get(row.match_id) ?? 0;
    const paid = Number(row.amount_paid ?? 0);

    const match = perMatch.get(row.match_id) ?? { collected: 0, expected: 0, unpaid: 0 };
    match.collected += paid;
    match.expected += fee;
    if (paid < fee) match.unpaid += 1;
    perMatch.set(row.match_id, match);

    const isGuest = row.player_id === null;
    const key = (row.player_id ?? row.guest_id) as string;
    const source = isGuest ? row.guest_players : row.profiles;
    const person = perPerson.get(key) ?? {
      name: source?.full_name || 'İsimsiz oyuncu',
      isGuest,
      played: 0,
      due: 0,
      paid: 0,
    };
    person.played += 1;
    person.due += fee;
    person.paid += paid;
    perPerson.set(key, person);
  }

  const totalExpected = [...perMatch.values()].reduce((sum, m) => sum + m.expected, 0);
  const totalCollected = [...perMatch.values()].reduce((sum, m) => sum + m.collected, 0);

  // Oyuncu odemeleri disindaki gelir ve giderler
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('ledger_entries')
    .select('id, match_id, direction, category, amount, description, occurred_on, reverses_id, reversed_at')
    .eq('season_id', seasonId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (ledgerError) throw new Error(ledgerError.message);

  const ledger = (ledgerRows ?? [])
    .filter((r) => !cancelledIds.has(r.match_id as string))
    .map((r) => ({
      ...r,
      amount: Number(r.amount),
    })) as unknown as LedgerRow[];

  const otherIncome = ledger
    .filter((r) => r.direction === 'income')
    .reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = ledger
    .filter((r) => r.direction === 'expense')
    .reduce((sum, r) => sum + r.amount, 0);

  const totalIncome = totalCollected + otherIncome;
  const balance = totalIncome - totalExpense;

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(
    new Date(),
  );

  // Gider kalemlerinin kirilimi: hangi basliga ne kadar gitti
  const expenseByCategory = new Map<LedgerCategory, number>();
  for (const row of ledger) {
    if (row.direction !== 'expense') continue;
    expenseByCategory.set(row.category, (expenseByCategory.get(row.category) ?? 0) + row.amount);
  }


  // Borcu olan uste, sonra alfabetik
  const people = [...perPerson.entries()]
    .map(([id, p]) => ({ id, ...p, balance: p.due - p.paid }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'tr'));

  const debtors = people.filter((p) => p.balance > 0);

  // Kasa hareketleri: elle girilen gelir/giderler ile oyunculardan toplanan
  // para tek listede. Odemeler kisi kisi yazilsa liste okunmaz oldugu icin
  // ayni haftanin ayni gun alinan odemeleri tek satirda toplanir.
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoff_at]));

  const paymentBuckets = new Map<string, { amount: number; names: string[]; at: string | null }>();

  for (const row of squad) {
    const paid = Number(row.amount_paid ?? 0);
    if (paid <= 0) continue;

    // Eski kayitlarda odeme ani bos kalmis olabilir; o zaman mac gunune yazilir
    const stamp = row.paid_at ?? null;
    const day = dayKey(stamp ?? kickoffById.get(row.match_id) ?? today);
    const key = `${row.match_id}|${day}`;

    const bucket = paymentBuckets.get(key) ?? { amount: 0, names: [], at: null };
    bucket.amount += paid;
    bucket.names.push(
      (row.player_id === null ? row.guest_players : row.profiles)?.full_name || 'İsimsiz oyuncu',
    );
    if (stamp && (!bucket.at || stamp > bucket.at)) bucket.at = stamp;
    paymentBuckets.set(key, bucket);
  }

  const movements: CashMovement[] = [
    ...ledger.map((row) => ({
      id: row.id,
      day: dayKey(row.occurred_on),
      kind: 'ledger' as const,
      direction: row.direction,
      amount: row.amount,
      label: LEDGER_CATEGORY_LABELS[row.category],
      detail: row.description,
      matchId: row.match_id,
      at: null,
      reversedAt: row.reversed_at,
      reversesId: row.reverses_id,
    })),
    ...[...paymentBuckets.entries()].map(([key, bucket]) => {
      const [matchId, day] = key.split('|');
      const names = [...bucket.names].sort((a, b) => a.localeCompare(b, 'tr'));
      return {
        id: `payment:${key}`,
        day,
        kind: 'player' as const,
        direction: 'income' as const,
        amount: bucket.amount,
        label: 'Oyuncu ödemesi',
        detail: `${names.length} kişi · ${names.join(', ')}`,
        matchId,
        at: bucket.at,
      };
    }),
  ];

  const cashDays = groupByDay(movements);

  return (
    <AppShell
      profile={profile}
      title="Muhasebe"
      subtitle="Sezonun para özeti. Ödemeler her maçın kendi sayfasından girilir."
      action={
        seasonList.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {seasonList.map((s) => (
              <Link
                key={s.id as string}
                href={`/admin/accounting?season=${s.id}`}
                className={`btn btn-sm ${s.id === seasonId ? 'btn-primary' : 'btn-ghost'}`}
              >
                {s.name as string}
              </Link>
            ))}
          </div>
        ) : undefined
      }
    >
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card card-pad">
          <p className="text-xs uppercase tracking-wide text-ink-300">Gelir</p>
          <p className="mt-1 text-lg font-semibold text-frost-100">{money(totalIncome)}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Oyunculardan {money(totalCollected)} · diğer {money(otherIncome)}
          </p>
        </div>
        <div className="card card-pad">
          <p className="text-xs uppercase tracking-wide text-ink-300">Gider</p>
          <p className="mt-1 text-lg font-semibold text-frost-100">{money(totalExpense)}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {[...expenseByCategory.entries()]
              .map(([c, v]) => `${LEDGER_CATEGORY_LABELS[c]} ${money(v)}`)
              .join(' · ') || 'Gider yok'}
          </p>
        </div>
        <div className="card card-pad">
          <p className="text-xs uppercase tracking-wide text-ink-300">Kasa</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              balance < 0 ? 'text-red-300' : 'text-frost-100'
            }`}
          >
            {money(balance)}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {balance < 0 ? 'Kasa açık veriyor' : 'Gelir − gider'}
          </p>
        </div>
        <div className="card card-pad">
          <p className="text-xs uppercase tracking-wide text-ink-300">Kalan alacak</p>
          <p className="mt-1 text-lg font-semibold text-frost-100">
            {money(Math.max(totalExpected - totalCollected, 0))}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {debtors.length} kişide borç · {matches.length} maç
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Kasa hareketleri <span className="badge badge-muted">{movements.length}</span>
        </h2>

        <p className="hint">
          Oyunculardan toplanan para ve haftalık gelir/gider birlikte, gün gün listelenir.
          Oyuncu ödemeleri aynı haftanın aynı gün alınanları tek satırda toplanır ve o haftanın
          Ödemeler sayfasından değiştirilir. Elle girilen kayıtları buradan iptal edebilir ya da
          silebilirsin.
        </p>

        <details className="card card-pad">
          <summary className="cursor-pointer text-sm font-medium text-azure-400">
            Kasa düzeltmesi ekle
          </summary>

          <ToastForm
            action={createAdjustmentEntry.bind(null, seasonId)}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <div className="field min-w-[10rem] flex-1">
              <label className="label" htmlFor="adjCategory">
                Kalem
              </label>
              <select
                id="adjCategory"
                name="category"
                defaultValue="other_expense"
                className="input"
              >
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
              <label className="label" htmlFor="adjAmount">
                Tutar (₺)
              </label>
              <input
                id="adjAmount"
                name="amount"
                type="number"
                min={0}
                step="0.01"
                required
                className="input"
              />
            </div>

            <div className="field w-44">
              <label className="label" htmlFor="adjDate">
                Tarih
              </label>
              <input
                id="adjDate"
                name="occurredOn"
                type="date"
                required
                defaultValue={today}
                className="input"
              />
            </div>

            <div className="field min-w-[12rem] flex-1">
              <label className="label" htmlFor="adjDescription">
                Açıklama
              </label>
              <input
                id="adjDescription"
                name="description"
                type="text"
                maxLength={200}
                placeholder="Örn. devreden kasa, sayim farkı"
                className="input"
              />
            </div>

            <button className="btn btn-ghost btn-sm">Ekle</button>
          </ToastForm>

          <p className="hint mt-2">
            Bu kayıt bir haftaya bağlanmaz, doğrudan sezon kasasına yazılır. Devreden bakiye,
            sayım farkı ya da tek seferlik masraf için.
          </p>
        </details>

        {cashDays.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Henüz kasa hareketi yok. Oyuncu ödemeleri ve o haftanın gelir/gideri her maçın
            <strong> Ödemeler</strong> sayfasından girilir.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cashDays.map((day) => (
              <div key={day.day} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] px-4 py-2.5">
                  <span className="text-sm font-semibold text-frost-100">{formatDay(day.day)}</span>
                  <span className="badge badge-muted">{day.movements.length} hareket</span>
                  <span className="ml-auto text-xs text-ink-500">
                    gelir {money(day.income)} · gider {money(day.expense)}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      day.net < 0 ? 'text-red-300' : 'text-emerald-300'
                    }`}
                    title="Günün kasaya net etkisi"
                  >
                    {day.net < 0 ? '−' : '+'}
                    {money(Math.abs(day.net))}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <tbody className="divide-line">
                      {day.movements.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap px-3 py-2.5 align-top">
                            <span
                              className={
                                row.reversedAt ? 'text-ink-500 line-through' : 'text-frost-100'
                              }
                            >
                              {row.label}
                            </span>
                            {row.reversedAt && <span className="badge badge-muted ml-2">İptal</span>}
                            {row.reversesId && (
                              <span className="badge badge-muted ml-2">Ters fiş</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 align-top text-ink-300">
                            {row.detail ? (
                              <span className="line-clamp-2" title={row.detail}>
                                {row.detail}
                              </span>
                            ) : null}
                            {row.matchId ? (
                              <Link
                                href={`/poll/${row.matchId}/payments`}
                                className="text-xs text-azure-400 underline"
                              >
                                o haftaya git
                              </Link>
                            ) : (
                              !row.detail && '—'
                            )}
                          </td>
                          <td
                            className={`whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold ${
                              row.direction === 'income' ? 'text-emerald-300' : 'text-red-300'
                            }`}
                          >
                            {row.direction === 'income' ? '+' : '−'}
                            {money(row.amount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                            {/* Oyuncu odemeleri buradan degistirilmez: tutar kadro
                                satirinda durur, o haftanin Odemeler sayfasina aittir */}
                            {row.kind === 'player' ? (
                              <span className="text-xs text-ink-500">Ödemeler sayfasından</span>
                            ) : (
                              <>
                                {!row.reversedAt && !row.reversesId && (
                                  <ToastForm
                                    action={reverseEntry.bind(null, row.id, row.matchId)}
                                    className="inline"
                                  >
                                    <button
                                      className="text-xs text-ink-300 underline"
                                      title="Aynı tutarda ters fiş keser; iki kayıt da listede kalır"
                                    >
                                      Ters fiş
                                    </button>
                                  </ToastForm>
                                )}
                                <ToastForm
                                  action={deleteEntry.bind(null, row.id, row.matchId)}
                                  className="ml-2 inline"
                                >
                                  <button
                                    className="text-xs text-ink-500 underline"
                                    title="Kaydı tamamen kaldırır"
                                  >
                                    Sil
                                  </button>
                                </ToastForm>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Kişi bazlı</h2>

        {people.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Bu sezonda henüz kadrosu kesinleşmiş maç yok.
          </div>
        ) : (
          <ul className="card divide-line">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-frost-100">{p.name}</div>
                  <div className="mt-0.5 text-xs text-ink-500">
                    {p.played} maç · {money(p.due)} borç · {money(p.paid)} ödendi
                  </div>
                </div>
                {p.balance > 0 ? (
                  <span className="badge badge-danger">{money(p.balance)} kalan</span>
                ) : (
                  <span className="badge badge-live">Temiz</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Maç bazlı</h2>

        {matches.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">Kayıt yok.</div>
        ) : (
          <ul className="card divide-line">
            {matches.map((m) => {
              const totals = perMatch.get(m.id) ?? { collected: 0, expected: 0, unpaid: 0 };
              return (
                <li key={m.id}>
                  <Link
                    href={`/poll/${m.id}/payments`}
                    className="card-link flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-frost-100">
                        {formatKickoff(m.kickoff_at)}
                      </div>
                      <div className="truncate text-xs text-ink-500">
                        {m.venue || 'Saha belirtilmedi'} · kişi başı {money(Number(m.fee_per_player))}
                        {m.sponsor_name ? ` · sponsor: ${m.sponsor_name}` : ''}
                      </div>
                    </div>
                    <span className="text-sm text-ink-300">
                      {money(totals.collected)} / {money(totals.expected)}
                    </span>
                    {totals.unpaid > 0 ? (
                      <span className="badge badge-muted">{totals.unpaid} kişi ödemedi</span>
                    ) : (
                      <span className="badge badge-live">Tamam</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
