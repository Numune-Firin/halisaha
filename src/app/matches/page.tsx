import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { getCurrentProfile, createServerSupabase } from '@/lib/supabase/server';
import { ensureScheduledMatches } from '@/lib/db/schedule';
import {
  displayStatus,
  formatKickoff,
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
  type MatchStatus,
} from '@/lib/ui/format';

export default async function MatchesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const supabase = await createServerSupabase();
  // Takvimde vakti gelmis maclar bu liste olusmadan once acilir
  await ensureScheduledMatches();

  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, squad_size, black_score, white_score, cancellation_reason, sponsor_name')
    .order('kickoff_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const rows = matches ?? [];

  return (
    <AppShell
      profile={profile}
      title="Maçlar"
      subtitle="Ligde açılmış tüm anketler ve oynanmış maçlar."
    >
      {rows.length === 0 ? (
        <div className="card card-pad text-sm text-ink-300">Henüz maç kaydı yok.</div>
      ) : (
        <ul className="card divide-line">
          {rows.map((m) => {
            const status = displayStatus(m.status as MatchStatus, m.kickoff_at as string);
            return (
              <li key={m.id}>
                <Link href={`/poll/${m.id}`} className="card-link flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-frost-100">
                      {formatKickoff(m.kickoff_at as string)}
                    </div>
                    <div className="truncate text-xs text-ink-300">
                      {status === 'cancelled'
                        ? (m.cancellation_reason as string | null) || 'Bu hafta iptal edildi'
                        : `${m.venue || 'Saha belirtilmedi'} · ${m.squad_size} kişilik kadro`}
                    </div>
                    {(m.sponsor_name as string) && (
                      <div className="mt-1 truncate text-xs text-amber-400">
                        Haftanın sponsoru: {m.sponsor_name as string}
                      </div>
                    )}
                  </div>
                  {m.black_score !== null && m.white_score !== null && (
                    <span className="text-sm font-semibold text-frost-100">
                      {m.black_score as number} - {m.white_score as number}
                    </span>
                  )}
                  <span className={MATCH_STATUS_BADGES[status]}>{MATCH_STATUS_LABELS[status]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
