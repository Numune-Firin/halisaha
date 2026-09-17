import { createServerSupabase } from '@/lib/supabase/server';
import type { Team } from '@/lib/standings/table';
import type { Position } from '@/lib/poll/types';

export interface SquadMember {
  /** match_squad.id — takim atamasi bu satir kimligiyle yapilir */
  id: string;
  /** Uye ise profiles.id, aday oyuncu ise null */
  playerId: string | null;
  /** Aday oyuncu ise guest_players.id, uye ise null */
  guestId: string | null;
  fullName: string;
  isGuest: boolean;
  /** Uyeligi olmayan ama adayliktan cikmis oyuncu */
  isRegular: boolean;
  position: Position | null;
  /** Yalnizca uyelerde dolu; hatirlatma maili buraya gider */
  email: string | null;
  team: Team | null;
  /** Bu mac icin odenen tutar; 0 ise odeme yok */
  amountPaid: number;
}

/** Bir macin kesinlesmis kadrosu, isimleriyle ve takimlariyla. */
export async function getSquad(matchId: string): Promise<SquadMember[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from('match_squad')
    .select('id, team, amount_paid, player_id, guest_id, profiles(full_name, position, email), guest_players(full_name, is_regular, position)')
    .eq('match_id', matchId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((r) => {
      const isGuest = r.player_id === null;
      const source = (isGuest ? r.guest_players : r.profiles) as unknown as {
        full_name: string;
        is_regular?: boolean;
        position: Position | null;
        email?: string | null;
      } | null;
      return {
        id: r.id as string,
        playerId: (r.player_id as string | null) ?? null,
        guestId: (r.guest_id as string | null) ?? null,
        fullName: source?.full_name || 'İsimsiz oyuncu',
        isGuest,
        isRegular: source?.is_regular === true,
        position: source?.position ?? null,
        email: source?.email ?? null,
        team: (r.team as Team | null) ?? null,
        amountPaid: Number(r.amount_paid ?? 0),
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
}
