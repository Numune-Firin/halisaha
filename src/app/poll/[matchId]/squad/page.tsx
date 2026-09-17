import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { getPoll } from '@/lib/db/poll';
import { formatKickoff } from '@/lib/ui/format';
import { lockSquad, unlockSquad } from './actions';
import { SquadPicker, type PickerPerson } from './SquadPicker';

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

  const { data: allGuests, error: guestError } = await supabase
    .from('guest_players')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name');
  if (guestError) throw new Error(guestError.message);

  const people: PickerPerson[] = [
    ...(allMembers ?? []).map((m) => ({
      id: m.id as string,
      fullName: m.full_name as string,
      isGuest: false,
    })),
    ...(allGuests ?? []).map((g) => ({
      id: g.id as string,
      fullName: g.full_name as string,
      isGuest: true,
    })),
  ];

  const preselectedIds = data.rows
    .filter((r) => r.placement === 'squad')
    .map((r) => r.playerId);

  async function save(formData: FormData) {
    'use server';
    const playerIds = formData.getAll('player') as string[];
    const guestIds = formData.getAll('guest') as string[];
    await lockSquad(matchId, playerIds, guestIds);
  }

  const isLocked = data.match.status === 'squad_locked';

  return (
    <AppShell
      profile={profile}
      title="Kadroyu kesinleştir"
      subtitle={`${formatKickoff(data.match.kickoffAt)} · ${data.match.venue || 'Saha belirtilmedi'}`}
    >
      <div className="card card-pad text-sm leading-relaxed text-ink-300">
        Sahada fiilen oynayan oyuncuları işaretle. Anketteki ilk{' '}
        <span className="text-frost-100">{data.match.squadSize}</span> kişi hazır işaretli gelir.
        Puanlar ve ödemeler bu liste üzerinden işler ve anket kapanır. Kadro tam{' '}
        <span className="text-frost-100">{data.match.squadSize}</span> kişi olmadan
        kesinleştirilemez.
      </div>

      {isLocked && (
        <form action={unlockSquad.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
          <p className="text-sm text-ink-300">
            Bu maçın kadrosu kesinleşmiş durumda. Geri alırsan anket yeniden açılır ve liste
            değiştirilebilir.
          </p>
          <button className="btn btn-danger btn-sm self-start">Kadroyu geri al</button>
        </form>
      )}

      <SquadPicker
        people={people}
        preselectedIds={preselectedIds}
        squadSize={data.match.squadSize}
        action={save}
      />
    </AppShell>
  );
}
