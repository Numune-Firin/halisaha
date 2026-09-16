import type { PollEntry, RankedPlayer } from './types';

/** Katman sirasi: kucuk sayi once gelir. Ofset bu sirayi degistiremez. */
const TIER_ORDER = { vip: 0, priority: 1, standard: 2 } as const;

/**
 * Anket listesini sistemin tek dogru sirasina gore dizer.
 *
 * Katmanlar: VIP -> Oncelikli -> Normal. Ofset katman atlatmaz.
 * VIP katmani admin'in verdigi vipRank duzenindedir.
 * Diger katmanlarda: effectiveTime = enteredAt + offsetSeconds * 1000 (offsetSeconds
 * saniye, enteredAt ms), alt sinir pollOpenedAt.
 * Esitlik bozucu her zaman gercek giris zamanidir, en son da playerId (deterministik
 * olsun diye) — boylece karsilastirici hicbir durumda kararsiz kalmaz.
 *
 * Cikmis oyuncular (withdrawnAt dolu) listede yer almaz.
 */
export function rankPollEntries({
  entries,
  pollOpenedAt,
  squadSize,
}: {
  entries: PollEntry[];
  pollOpenedAt: number;
  squadSize: number;
}): RankedPlayer[] {
  const active = entries.filter((e) => e.withdrawnAt === null);

  const computed = active.map((e) => ({
    entry: e,
    effectiveTime: Math.max(pollOpenedAt, e.enteredAt + e.offsetSeconds * 1000),
  }));

  computed.sort((a, b) => {
    const tierDiff = TIER_ORDER[a.entry.entryType] - TIER_ORDER[b.entry.entryType];
    if (tierDiff !== 0) return tierDiff;

    if (a.entry.entryType === 'vip') {
      const vipRankDiff = (a.entry.vipRank ?? Number.MAX_SAFE_INTEGER)
                          - (b.entry.vipRank ?? Number.MAX_SAFE_INTEGER);
      if (vipRankDiff !== 0) return vipRankDiff;
    } else {
      const timeDiff = a.effectiveTime - b.effectiveTime;
      if (timeDiff !== 0) return timeDiff;
    }

    const enteredDiff = a.entry.enteredAt - b.entry.enteredAt;
    if (enteredDiff !== 0) return enteredDiff;

    return a.entry.playerId.localeCompare(b.entry.playerId);
  });

  return computed.map((c, i) => ({
    playerId: c.entry.playerId,
    entryType: c.entry.entryType,
    rank: i + 1,
    placement: i < squadSize ? 'squad' : 'reserve',
    effectiveTime: c.effectiveTime,
  }));
}
