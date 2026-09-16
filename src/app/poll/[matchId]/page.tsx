import { redirect, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getCurrentProfile } from '@/lib/supabase/server';
import { getPoll } from '@/lib/db/poll';
import {
  formatKickoff,
  formatShort,
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
} from '@/lib/ui/format';
import { PollList } from './PollList';
import { togglePollEntry } from './actions';
import { LiveRefresh } from './LiveRefresh';

const HOUR_MS = 60 * 60 * 1000;

export default async function PollPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const data = await getPoll(matchId);
  if (!data) notFound();

  const { match } = data;
  const isListed = data.rows.some((r) => r.playerId === profile.id);
  const freeUntil = new Date(
    new Date(match.kickoffAt).getTime() - match.withdrawalWindowHours * HOUR_MS,
  );
  const isFreeWindowOpen = Date.now() < freeUntil.getTime();

  return (
    <AppShell
      profile={profile}
      title={formatKickoff(match.kickoffAt)}
      subtitle={match.venue || 'Saha belirtilmedi'}
      action={<span className={MATCH_STATUS_BADGES[match.status]}>{MATCH_STATUS_LABELS[match.status]}</span>}
    >
      <LiveRefresh matchId={matchId} />

      <PollList
        rows={data.rows}
        squadSize={match.squadSize}
        showEmptySlots={match.status === 'poll_open'}
      />

      {match.status === 'poll_open' && (
        <div className="sticky bottom-3 flex flex-col gap-2">
          <form
            action={async () => {
              'use server';
              // Karar render aninda yakalanan isListed'e gore degil,
              // togglePollEntry'nin o an veritabanindan okudugu duruma gore
              // verilir; buton metni yalnizca gorsel amacli render anini yansitir.
              await togglePollEntry(matchId);
            }}
          >
            <button type="submit" className={`btn btn-block ${isListed ? 'btn-danger' : 'btn-go'}`}>
              {isListed ? 'Anketten çık' : 'Ankete gir'}
            </button>
          </form>

          <p className="card card-pad text-center text-xs leading-relaxed text-ink-300">
            {isFreeWindowOpen ? (
              <>
                <span className="text-cream-100">{formatShort(freeUntil.toISOString())}</span>{' '}
                tarihine kadar cezasız çıkabilirsin. Sonrasında çıkarsan sonraki ankette giriş
                saatine {match.lateWithdrawalPenaltySeconds} saniye eklenir.
              </>
            ) : (
              <>
                Serbest çıkış süresi doldu. Şimdi çıkarsan sonraki ankette giriş saatine{' '}
                <span className="text-cream-100">{match.lateWithdrawalPenaltySeconds} saniye</span>{' '}
                ceza eklenir.
              </>
            )}
          </p>
        </div>
      )}

      {match.status !== 'poll_open' && (
        <div className="card card-pad text-sm text-ink-300">
          Bu maçın anketi kapandı, liste kesinleşti.
        </div>
      )}
    </AppShell>
  );
}
