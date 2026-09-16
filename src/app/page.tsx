import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile, createServerSupabase } from '@/lib/supabase/server';

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const supabase = await createServerSupabase();
  const { data: matches } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status')
    .in('status', ['poll_open', 'squad_locked'])
    .order('kickoff_at', { ascending: true })
    .limit(3);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Halı Saha</h1>
        {profile.role === 'admin' && (
          <Link href="/admin" className="text-sm text-blue-600 underline">
            Admin
          </Link>
        )}
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Yaklaşan maçlar
        </h2>
        {(matches ?? []).length === 0 && <p className="text-gray-500">Açık anket yok.</p>}
        <ul className="flex flex-col gap-2">
          {(matches ?? []).map((m) => (
            <li key={m.id}>
              <Link
                href={`/poll/${m.id}`}
                className="block rounded-lg border border-gray-200 p-3"
              >
                <div className="font-medium">
                  {new Date(m.kickoff_at as string).toLocaleString('tr-TR')}
                </div>
                <div className="text-sm text-gray-600">{m.venue}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
