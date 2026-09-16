import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { getCurrentProfile, createServerSupabase } from '@/lib/supabase/server';
import {
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
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, squad_size')
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
            const status = m.status as MatchStatus;
            return (
              <li key={m.id}>
                <Link href={`/poll/${m.id}`} className="card-link flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-cream-100">
                      {formatKickoff(m.kickoff_at as string)}
                    </div>
                    <div className="truncate text-xs text-ink-300">
                      {m.venue || 'Saha belirtilmedi'} · {m.squad_size} kişilik kadro
                    </div>
                  </div>
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
