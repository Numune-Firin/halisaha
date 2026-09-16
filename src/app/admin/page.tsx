import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase } from '@/lib/supabase/server';
import { approveMember, openPoll } from './actions';

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createServerSupabase();

  const { data: pendingMembers } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('status', 'pending');

  const { data: matches } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status')
    .order('kickoff_at', { ascending: false })
    .limit(10);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-8 p-4">
      <section>
        <h2 className="mb-2 font-semibold">Onay bekleyen üyeler</h2>
        {(pendingMembers ?? []).length === 0 && (
          <p className="text-gray-500">Bekleyen üye yok.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(pendingMembers ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between">
              <span>{m.full_name}</span>
              <form action={approveMember.bind(null, m.id)}>
                <button className="rounded bg-green-600 px-3 py-1 text-sm text-white">
                  Onayla
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Yeni anket aç</h2>
        <form action={openPoll} className="flex flex-col gap-2">
          <input type="datetime-local" name="kickoffAt" required className="rounded border p-2" />
          <input type="text" name="venue" placeholder="Saha adı" className="rounded border p-2" />
          <input type="number" name="squadSize" defaultValue={14} className="rounded border p-2" />
          <input type="number" name="feePerPlayer" placeholder="Kişi başı ücret" className="rounded border p-2" />
          <input type="number" name="withdrawalWindow" defaultValue={20} className="rounded border p-2" />
          <input type="number" name="lateWithdrawalPenalty" defaultValue={8} className="rounded border p-2" />
          <input type="date" name="paymentDueOn" className="rounded border p-2" />
          <button className="rounded bg-black px-4 py-2 text-white">Anketi aç</button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Maçlar</h2>
        <ul className="flex flex-col gap-1">
          {(matches ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3">
              <a className="text-blue-600 underline" href={`/poll/${m.id}`}>
                {new Date(m.kickoff_at as string).toLocaleString('tr-TR')} — {m.venue} ({m.status})
              </a>
              <a className="text-blue-600 underline" href={`/poll/${m.id}/squad`}>
                Kadro
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
