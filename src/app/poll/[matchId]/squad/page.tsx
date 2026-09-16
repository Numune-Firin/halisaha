import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { getPoll } from '@/lib/db/poll';
import { formatKickoff } from '@/lib/ui/format';
import { lockSquad } from './actions';

export default async function SquadPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const data = await getPoll(matchId);
  if (!data) notFound();

  const supabase = await createServerSupabase();
  // Pasife alinmis uyeler de listelenir: match_squad puanin ve odemenin tek
  // dayanagi; o mac oynanirken aktif olup sonradan pasife alinan bir oyuncu
  // isaretlenemezse maçin kaydi kalici olarak eksik kalir.
  const { data: allMembers, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('status', ['active', 'inactive'])
    .order('full_name');
  if (error) throw new Error(error.message);

  const inSquad = new Set(
    data.rows.filter((r) => r.placement === 'squad').map((r) => r.playerId),
  );

  async function save(formData: FormData) {
    'use server';
    const selected = formData.getAll('player') as string[];
    await lockSquad(matchId, selected);
  }

  return (
    <AppShell
      profile={profile}
      title="Kadroyu kesinleştir"
      subtitle={`${formatKickoff(data.match.kickoffAt)} · ${data.match.venue || 'Saha belirtilmedi'}`}
    >
      <div className="card card-pad text-sm leading-relaxed text-ink-300">
        Sahada fiilen oynayan oyuncuları işaretle. Anketteki ilk{' '}
        <span className="text-cream-100">{data.match.squadSize}</span> kişi hazır işaretli gelir.
        Puanlar ve ödemeler bu liste üzerinden işler ve anket kapanır.
      </div>

      <form action={save} className="flex flex-col gap-3">
        <ul className="card divide-line">
          {(allMembers ?? []).map((m) => (
            <li key={m.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  name="player"
                  value={m.id}
                  defaultChecked={inSquad.has(m.id)}
                  className="h-4 w-4 accent-[var(--color-gold-400)]"
                />
                <span className="text-sm text-ink-100">{m.full_name || 'İsimsiz oyuncu'}</span>
              </label>
            </li>
          ))}
        </ul>

        <button className="btn btn-primary btn-block">Kadroyu kesinleştir</button>
      </form>
    </AppShell>
  );
}
