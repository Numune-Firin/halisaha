import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase/server';
import { getPoll } from '@/lib/db/poll';
import { PollList } from './PollList';
import { togglePollEntry } from './actions';
import { LiveRefresh } from './LiveRefresh';

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

  const isListed = data.rows.some((r) => r.playerId === profile.id);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-4">
      <header>
        <h1 className="text-xl font-semibold">
          {new Date(data.match.kickoffAt).toLocaleString('tr-TR')}
        </h1>
        <p className="text-gray-600">{data.match.venue}</p>
      </header>

      <LiveRefresh matchId={matchId} />
      <PollList rows={data.rows} />

      {data.match.status === 'poll_open' && (
        <form
          action={async () => {
            'use server';
            // Karar render aninda yakalanan isListed'e gore degil,
            // togglePollEntry'nin o an veritabanindan okudugu duruma gore
            // verilir; buton metni yalnizca gorsel amacli render anini yansitir.
            await togglePollEntry(matchId);
          }}
        >
          <button
            type="submit"
            className={`w-full rounded-lg px-6 py-3 text-white ${
              isListed ? 'bg-red-600' : 'bg-green-600'
            }`}
          >
            {isListed ? 'Anketten çık' : 'Ankete gir'}
          </button>
        </form>
      )}
    </main>
  );
}
