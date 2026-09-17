import { createServerSupabase } from '@/lib/supabase/server';
import {
  computeStandings,
  type StandingRow,
  type StandingsAppearance,
  type StandingsMatch,
  type Team,
} from '@/lib/standings/table';

export interface SeasonOption {
  id: string;
  name: string;
  isActive: boolean;
}

/** Sezonlar, aktif olan en ustte olacak sekilde yeniden eskiye. */
export async function listSeasons(): Promise<SeasonOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('seasons')
    .select('id, name, is_active')
    .order('starts_on', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    isActive: s.is_active as boolean,
  }));
}

/**
 * Bir sezonun puan durumu. Yalnizca skoru girilmis maclar sayilir; kadroda
 * olup takimi atanmamis oyuncular o maci oynamamis sayilir.
 */
export async function getStandings(seasonId: string): Promise<StandingRow[]> {
  const supabase = await createServerSupabase();

  const { data: matchRows, error: matchError } = await supabase
    .from('matches')
    .select('id, black_score, white_score')
    .eq('season_id', seasonId)
    .in('status', ['played', 'completed'])
    .not('black_score', 'is', null)
    .not('white_score', 'is', null);
  if (matchError) throw new Error(matchError.message);

  const matches: StandingsMatch[] = (matchRows ?? []).map((m) => ({
    id: m.id as string,
    blackScore: m.black_score as number,
    whiteScore: m.white_score as number,
  }));

  if (matches.length === 0) return [];

  const { data: squadRows, error: squadError } = await supabase
    .from('match_squad')
    .select('match_id, team, player_id, guest_id, profiles(full_name), guest_players(full_name)')
    .in(
      'match_id',
      matches.map((m) => m.id),
    );
  if (squadError) throw new Error(squadError.message);

  const appearances: StandingsAppearance[] = (squadRows ?? []).map((r) => {
    const isGuest = r.player_id === null;
    const source = (isGuest ? r.guest_players : r.profiles) as unknown as {
      full_name: string;
    } | null;
    return {
      matchId: r.match_id as string,
      participantId: (r.player_id ?? r.guest_id) as string,
      fullName: source?.full_name || 'İsimsiz oyuncu',
      isGuest,
      team: (r.team as Team | null) ?? null,
    };
  });

  return computeStandings(matches, appearances);
}
