import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase } from '@/lib/supabase/server';
import { getPoll } from '@/lib/db/poll';
import { lockSquad } from './actions';

export default async function SquadPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  await requireAdmin();

  const data = await getPoll(matchId);
  if (!data) notFound();

  const supabase = await createServerSupabase();
  // Pasife alinmis uyeler de listelenir: match_squad puanin ve odemenin tek
  // dayanagi; o mac oynanirken aktif olup sonradan pasife alinan bir oyuncu
  // isaretlenemezse maçin kaydi kalici olarak eksik kalir.
  const { data: allMembers } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('status', ['active', 'inactive'])
    .order('full_name');

  const inSquad = new Set(
    data.rows.filter((r) => r.placement === 'squad').map((r) => r.playerId),
  );

  async function save(formData: FormData) {
    'use server';
    const selected = formData.getAll('player') as string[];
    await lockSquad(matchId, selected);
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Kadroyu kesinleştir</h1>
      <p className="text-sm text-gray-600">
        Sahada fiilen olan oyuncuları işaretle. Puanlar ve ödemeler bu liste üzerinden işler.
      </p>

      <form action={save} className="flex flex-col gap-2">
        {(allMembers ?? []).map((m) => (
          <label key={m.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="player"
              value={m.id}
              defaultChecked={inSquad.has(m.id)}
            />
            <span>{m.full_name}</span>
          </label>
        ))}
        <button className="mt-4 rounded bg-black px-4 py-2 text-white">
          Kadroyu kesinleştir
        </button>
      </form>
    </main>
  );
}
