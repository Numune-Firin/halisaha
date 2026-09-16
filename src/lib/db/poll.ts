import { createServerSupabase } from '@/lib/supabase/server';
import { rankPollEntries } from '@/lib/poll/ranking';
import type { PollEntry, EntryType, Position } from '@/lib/poll/types';

export interface MatchSummary {
  id: string;
  kickoffAt: string;
  venue: string;
  status: 'poll_open' | 'squad_locked' | 'played' | 'completed';
  squadSize: number;
  pollOpenedAt: string;
  withdrawalWindowHours: number;
  lateWithdrawalPenaltySeconds: number;
}

export interface PollRow {
  playerId: string;
  fullName: string;
  position: Position | null;
  entryType: EntryType;
  rank: number;
  placement: 'squad' | 'reserve';
}

/** Bir macin anket listesini sunucuda hesaplayip sirali dondurur. */
export async function getPoll(
  matchId: string,
): Promise<{ match: MatchSummary; rows: PollRow[] } | null> {
  const supabase = await createServerSupabase();

  const { data: matchRow, error: matchError } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, squad_size, poll_opened_at, withdrawal_window_hours, late_withdrawal_penalty_seconds')
    .eq('id', matchId)
    .maybeSingle();

  // "Bulunamadi" (satir yok) ile "sorgu hata verdi" ayri davranir: ilki null
  // dondurup notFound()'a birakilir, ikincisi firlatilir. Aksi halde gecici
  // bir okuma hatasi sessizce "mac yok" gibi gorunup yanlis sayfaya duser.
  if (matchError) throw new Error(matchError.message);
  if (!matchRow) return null;

  const { data: entryRows, error: entryError } = await supabase
    .from('match_entries')
    .select('player_id, entry_type, entered_at, offset_seconds, vip_rank, withdrawn_at, profiles(full_name, position)')
    .eq('match_id', matchId);

  // Ayni gerekce: bu sorgu hata verirse rows'u sessizce [] yapmak, ankette
  // olan bir oyuncuya "Ankete gir" gosterip sirasini kaybettirebilir.
  if (entryError) throw new Error(entryError.message);

  const rows = entryRows ?? [];

  const entries: PollEntry[] = rows.map((r) => ({
    playerId: r.player_id as string,
    entryType: r.entry_type as EntryType,
    enteredAt: new Date(r.entered_at as string).getTime(),
    offsetSeconds: r.offset_seconds as number,
    vipRank: r.vip_rank as number | null,
    withdrawnAt: r.withdrawn_at ? new Date(r.withdrawn_at as string).getTime() : null,
  }));

  const ranked = rankPollEntries({
    entries,
    pollOpenedAt: new Date(matchRow.poll_opened_at as string).getTime(),
    squadSize: matchRow.squad_size as number,
  });

  const profileById = new Map<string, { fullName: string; position: Position | null }>(
    rows.map((r) => {
      const p = r.profiles as unknown as { full_name: string; position: Position | null };
      return [r.player_id as string, { fullName: p?.full_name ?? '', position: p?.position ?? null }];
    }),
  );

  return {
    match: {
      id: matchRow.id as string,
      kickoffAt: matchRow.kickoff_at as string,
      venue: matchRow.venue as string,
      status: matchRow.status as MatchSummary['status'],
      squadSize: matchRow.squad_size as number,
      pollOpenedAt: matchRow.poll_opened_at as string,
      withdrawalWindowHours: matchRow.withdrawal_window_hours as number,
      lateWithdrawalPenaltySeconds: matchRow.late_withdrawal_penalty_seconds as number,
    },
    rows: ranked.map((p) => ({
      playerId: p.playerId,
      fullName: profileById.get(p.playerId)?.fullName ?? '',
      position: profileById.get(p.playerId)?.position ?? null,
      entryType: p.entryType,
      rank: p.rank,
      placement: p.placement,
    })),
  };
}
