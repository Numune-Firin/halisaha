import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import {
  formatKickoff,
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
  type MatchStatus,
} from '@/lib/ui/format';
import { approveMember, openPoll } from './actions';

export default async function AdminPage() {
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServerSupabase();

  const { data: pendingMembers } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('status', 'pending');

  const { data: settings } = await supabase.from('settings').select('*').maybeSingle();

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .maybeSingle();

  const { data: matches } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status')
    .order('kickoff_at', { ascending: false })
    .limit(10);

  const pending = pendingMembers ?? [];

  return (
    <AppShell
      profile={profile}
      title="Yönetim paneli"
      subtitle={
        season ? (
          <>
            Yeni maçlar <span className="text-frost-100">{season.name}</span> sezonuna yazılır.
          </>
        ) : (
          <>
            Aktif sezon yok.{' '}
            <Link href="/admin/seasons" className="text-azure-400 underline">
              Önce bir sezon tanımla
            </Link>
            .
          </>
        )
      }
    >
      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Onay bekleyen üyeler
          {pending.length > 0 && <span className="badge badge-vip">{pending.length}</span>}
        </h2>

        {pending.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">Bekleyen üye yok.</div>
        ) : (
          <ul className="card divide-line">
            {pending.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-frost-100">
                    {m.full_name || 'İsimsiz oyuncu'}
                  </div>
                  <div className="truncate text-xs text-ink-500">
                    {(m.email as string | null) || 'E-posta yok'}
                  </div>
                </div>
                <form action={approveMember.bind(null, m.id)}>
                  <button className="btn btn-go btn-sm">Onayla</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Yeni anket aç</h2>
        <p className="hint">
          Tek seferlik bir maç için. Her hafta aynı gün ve saatte oynuyorsanız tek tek açmak
          yerine{' '}
          <Link href="/admin/schedule" className="text-azure-400 underline">
            anket takvimi
          </Link>{' '}
          tanımla; anketler kendiliğinden açılsın.
        </p>
        <form action={openPoll} className="card card-pad flex flex-col gap-4">
          <div className="field">
            <label className="label" htmlFor="kickoffAt">
              Maç günü ve saati
            </label>
            <input id="kickoffAt" type="datetime-local" name="kickoffAt" required className="input" />
            <p className="hint">Topun yuvarlanacağı an. Çıkış süresi bu saate göre hesaplanır.</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="venue">
              Saha
            </label>
            <input
              id="venue"
              type="text"
              name="venue"
              placeholder="Örn. Numune Halı Saha, 2 numaralı saha"
              className="input"
            />
            <p className="hint">Maçın oynanacağı tesisin adı; listelerde bu yazı görünür.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="squadSize">
                Kadro mevcudu
              </label>
              <input
                id="squadSize"
                type="number"
                name="squadSize"
                min={2}
                max={40}
                defaultValue={settings?.squad_size ?? 14}
                className="input"
              />
              <p className="hint">
                Ankete ilk giren kaç kişi kadroya yazılsın. 7-7 oynuyorsanız 14. Sonrakiler yedek
                listesine düşer.
              </p>
            </div>

            <div className="field">
              <label className="label" htmlFor="feePerPlayer">
                Kişi başı ücret (₺)
              </label>
              <input
                id="feePerPlayer"
                type="number"
                name="feePerPlayer"
                min={0}
                step="0.01"
                defaultValue={settings?.fee_per_player ?? 0}
                className="input"
              />
              <p className="hint">Saha kirasının oyuncu başına düşen payı. Tahsilatta kullanılır.</p>
            </div>

            <div className="field">
              <label className="label" htmlFor="withdrawalWindow">
                Serbest çıkış süresi (saat)
              </label>
              <input
                id="withdrawalWindow"
                type="number"
                name="withdrawalWindow"
                min={0}
                defaultValue={settings?.withdrawal_window_hours ?? 20}
                className="input"
              />
              <p className="hint">
                Maça bu kadar saat kalana dek listeden cezasız çıkılabilir. Sonrasında çıkan
                oyuncuya ceza yazılır.
              </p>
            </div>

            <div className="field">
              <label className="label" htmlFor="lateWithdrawalPenalty">
                Geç çıkış cezası (saniye)
              </label>
              <input
                id="lateWithdrawalPenalty"
                type="number"
                name="lateWithdrawalPenalty"
                min={0}
                defaultValue={settings?.late_withdrawal_penalty_seconds ?? 8}
                className="input"
              />
              <p className="hint">
                Serbest süre dolduktan sonra çıkan oyuncunun sonraki ankette giriş saatine eklenecek
                saniye. Büyüdükçe sırası geriye düşer.
              </p>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="paymentDueOn">
              Son ödeme tarihi
            </label>
            <input id="paymentDueOn" type="date" name="paymentDueOn" className="input" />
            <p className="hint">Kişi başı ücretin toplanacağı son gün. Boş bırakabilirsin.</p>
          </div>

          <button className="btn btn-primary btn-block">Anketi aç</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Son maçlar</h2>
        {(matches ?? []).length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">Henüz maç yok.</div>
        ) : (
          <ul className="card divide-line">
            {(matches ?? []).map((m) => {
              const status = m.status as MatchStatus;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-frost-100">
                      {formatKickoff(m.kickoff_at as string)}
                    </div>
                    <div className="truncate text-xs text-ink-300">
                      {m.venue || 'Saha belirtilmedi'}
                    </div>
                  </div>
                  <span className={MATCH_STATUS_BADGES[status]}>{MATCH_STATUS_LABELS[status]}</span>
                  <Link href={`/poll/${m.id}`} className="btn btn-ghost btn-sm">
                    Anket
                  </Link>
                  <Link href={`/poll/${m.id}/squad`} className="btn btn-ghost btn-sm">
                    Kadro
                  </Link>
                  <Link href={`/poll/${m.id}/result`} className="btn btn-ghost btn-sm">
                    Skor
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
