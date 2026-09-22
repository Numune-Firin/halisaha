import { createServerSupabase } from '@/lib/supabase/server';
import { getRatingSummary } from '@/lib/db/ratings';
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
  /**
   * Oyuncunun genel yildizi: yonetici elle yazdiysa o, yoksa butun maclardan
   * gelen ortalama. Hic oy almamis oyuncuda null olur.
   */
  rating: number | null;
  /**
   * Listeye girdigi an. Ankete girenlerde giris saati, yonetici elle
   * ekledigindeyse eklendigi an. Kadroya sonradan, ankete hic girmeden
   * yazilan kisilerde null kalir.
   */
  enteredAt: string | null;
  /** Sahadaki yeri (yuzde); diziliş kurulmadiysa null */
  posX: number | null;
  posY: number | null;
}

/** Bir macin kesinlesmis kadrosu, isimleriyle ve takimlariyla. */
export async function getSquad(matchId: string): Promise<SquadMember[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from('match_squad')
    .select('id, team, amount_paid, pos_x, pos_y, player_id, guest_id, profiles(full_name, position, email, override_rating), guest_players(full_name, is_regular, position, override_rating)')
    .eq('match_id', matchId);
  if (error) throw new Error(error.message);

  // Takim dengelemesi yildiza bakar; elle yazilan deger ortalamayi ezer
  const summary = await getRatingSummary();

  // Listeye giris ani anket satirinda durur; kadro satirinda degil
  const { data: entryRows } = await supabase
    .from('match_entries')
    .select('player_id, guest_id, entered_at')
    .eq('match_id', matchId)
    .is('withdrawn_at', null);
  const enteredAtById = new Map(
    (entryRows ?? []).map((e) => [
      ((e.player_id ?? e.guest_id) as string) ?? '',
      e.entered_at as string,
    ]),
  );

  return (data ?? [])
    .map((r) => {
      const isGuest = r.player_id === null;
      const source = (isGuest ? r.guest_players : r.profiles) as unknown as {
        full_name: string;
        is_regular?: boolean;
        position: Position | null;
        email?: string | null;
        override_rating?: number | string | null;
      } | null;
      const participantId = ((r.player_id ?? r.guest_id) as string) ?? '';
      const override =
        source?.override_rating === null || source?.override_rating === undefined
          ? null
          : Number(source.override_rating);
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
        rating: override ?? summary.get(participantId)?.average ?? null,
        enteredAt: enteredAtById.get(participantId) ?? null,
        posX: r.pos_x === null || r.pos_x === undefined ? null : Number(r.pos_x),
        posY: r.pos_y === null || r.pos_y === undefined ? null : Number(r.pos_y),
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
}
