import type { PollRow } from '@/lib/db/poll';

const POSITION_LABELS: Record<string, string> = {
  goalkeeper: 'KL',
  defender: 'DF',
  midfielder: 'OS',
  forward: 'FV',
};

export function PollList({ rows }: { rows: PollRow[] }) {
  const squad = rows.filter((r) => r.placement === 'squad');
  const reserves = rows.filter((r) => r.placement === 'reserve');

  return (
    <div className="flex flex-col gap-6">
      <Section title="Kadro" rows={squad} />
      {reserves.length > 0 && <Section title="Yedekler" rows={reserves} />}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: PollRow[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      <ol className="divide-y divide-gray-200 rounded-lg border border-gray-200">
        {rows.map((r) => (
          <li key={r.playerId} className="flex items-center gap-3 px-3 py-2">
            <span className="w-6 text-right text-sm text-gray-500">{r.rank}</span>
            <span className="flex-1">{r.fullName}</span>
            {r.position && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                {POSITION_LABELS[r.position]}
              </span>
            )}
            {r.entryType === 'vip' && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">VIP</span>
            )}
            {r.entryType === 'priority' && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">Öncelikli</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
