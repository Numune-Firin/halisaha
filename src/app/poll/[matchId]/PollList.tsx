import type { PollRow } from '@/lib/db/poll';

const POSITION_LABELS: Record<string, string> = {
  goalkeeper: 'KL',
  defender: 'DF',
  midfielder: 'OS',
  forward: 'FV',
};

export function PollList({
  rows,
  squadSize,
  showEmptySlots,
}: {
  rows: PollRow[];
  squadSize: number;
  /** Anket kapandiktan sonra bos kontenjan gostermek anlamsizdir. */
  showEmptySlots: boolean;
}) {
  const squad = rows.filter((r) => r.placement === 'squad');
  const reserves = rows.filter((r) => r.placement === 'reserve');
  const emptySlots = showEmptySlots ? Math.max(0, squadSize - squad.length) : 0;

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Kadro"
        count={`${squad.length}/${squadSize}`}
        rows={squad}
        emptyText="Henüz kimse ankete girmedi."
        emptySlots={emptySlots}
      />
      {reserves.length > 0 && (
        <Section title="Yedekler" count={`${reserves.length}`} rows={reserves} emptyText="" />
      )}
    </div>
  );
}

function Section({
  title,
  count,
  rows,
  emptyText,
  emptySlots = 0,
}: {
  title: string;
  count: string;
  rows: PollRow[];
  emptyText: string;
  emptySlots?: number;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-title">
        {title}
        <span className="badge badge-muted">{count}</span>
      </h2>

      {rows.length === 0 && emptyText ? (
        <div className="card card-pad text-sm text-ink-300">{emptyText}</div>
      ) : (
        <ol className="card divide-line overflow-hidden">
          {rows.map((r) => (
            <li key={r.playerId} className="flex items-center gap-3 px-3 py-2.5">
              <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-500">
                {r.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{r.fullName}</span>
              {r.position && <span className="badge badge-muted">{POSITION_LABELS[r.position]}</span>}
              {r.entryType === 'vip' && <span className="badge badge-vip">VIP</span>}
              {r.entryType === 'priority' && <span className="badge badge-priority">Öncelikli</span>}
            </li>
          ))}

          {Array.from({ length: emptySlots }, (_, i) => (
            <li
              key={`empty-${i}`}
              className="flex items-center gap-3 px-3 py-2.5 text-sm text-ink-500"
            >
              <span className="w-7 shrink-0 text-right tabular-nums">{rows.length + i + 1}</span>
              <span className="flex-1">Boş</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
