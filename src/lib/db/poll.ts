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
  /** Uye ise profiles.id, aday oyuncu ise guest_players.id */
  playerId: string;
  fullName: string;
  position: Position | null;
  entryType: EntryType;
  rank: number;
  placement: 'squad' | 'reserve';
  /** Gruba uye olmayan, admin'in elle ekledigi aday oyuncu */
  isGuest: boolean;
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
    .select('player_id, guest_id, entry_type, entered_at, offset_seconds, vip_rank, withdrawn_at, profiles(full_name, position), guest_players(full_name, position)')
    .eq('match_id', matchId);

  // Ayni gerekce: bu sorgu hata verirse rows'u sessizce [] yapmak, ankette
  // olan bir oyuncuya "Ankete gir" gosterip sirasini kaybettirebilir.
  if (entryError) throw new Error(entryError.message);

  const rows = entryRows ?? [];

  // Siralamada uye ile aday oyuncu ayni havuzdadir. Satirin kimligi olarak
  // uyenin profiles.id'si ya da aday oyuncunun guest_players.id'si kullanilir;
  // ikisi de uuid oldugu icin carpismazlar.
  const entries: PollEntry[] = rows.map((r) => ({
    playerId: (r.player_id ?? r.guest_id) as string,
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

  type Participant = { fullName: string; position: Position | null; isGuest: boolean };
  const participantById = new Map<string, Participant>(
    rows.map((r) => {
      const isGuest = r.player_id === null;
      const source = (isGuest ? r.guest_players : r.profiles) as unknown as {
        full_name: string;
        position: Position | null;
      };
      return [
        (r.player_id ?? r.guest_id) as string,
        { fullName: source?.full_name ?? '', position: source?.position ?? null, isGuest },
      ];
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
      fullName: participantById.get(p.playerId)?.fullName ?? '',
      position: participantById.get(p.playerId)?.position ?? null,
      entryType: p.entryType,
      rank: p.rank,
      placement: p.placement,
      isGuest: participantById.get(p.playerId)?.isGuest ?? false,
    })),
  };
}
