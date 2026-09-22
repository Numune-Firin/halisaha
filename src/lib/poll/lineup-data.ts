import type { SquadMember } from '@/lib/db/squad';
import { arrangeLineup, type LineupSpot, type LineupTeam } from '@/lib/poll/lineup';

/**
 * Kayitli takim ve konumlardan saha dizilişi cikarir.
 *
 * Takimi belli ama konumu olmayan oyuncular (diziliş ekrani gelmeden once
 * kurulmus eski maclar) mevkilerine gore dizilir, boylece o maclar da sahada
 * dogru gorunur.
 */
export function spotsFromSquad(squad: SquadMember[]): Record<string, LineupSpot> {
  const teams: Record<string, LineupTeam> = {};
  for (const member of squad) {
    if (member.team === 'black' || member.team === 'white') teams[member.id] = member.team;
  }

  const arranged = arrangeLineup(
    squad.map((m) => ({ id: m.id, position: m.position, rating: m.rating })),
    teams,
  );

  const spots: Record<string, LineupSpot> = {};
  for (const member of squad) {
    const team = teams[member.id];
    if (!team) continue;
    spots[member.id] =
      member.posX !== null && member.posY !== null
        ? { team, x: member.posX, y: member.posY }
        : (arranged[member.id] ?? { team, x: 50, y: team === 'black' ? 25 : 75 });
  }

  return spots;
}

/** Oneri satirlarindan saha dizilişi; konumsuz eski oneriler icin ayni mantik. */
export function spotsFromSlots(
  squad: SquadMember[],
  slots: { squad_row_id: string; team: LineupTeam; pos_x: number | null; pos_y: number | null }[],
): Record<string, LineupSpot> {
  const teams: Record<string, LineupTeam> = {};
  for (const slot of slots) teams[slot.squad_row_id] = slot.team;

  const arranged = arrangeLineup(
    squad.map((m) => ({ id: m.id, position: m.position, rating: m.rating })),
    teams,
  );

  const spots: Record<string, LineupSpot> = {};
  for (const slot of slots) {
    spots[slot.squad_row_id] =
      slot.pos_x !== null && slot.pos_y !== null
        ? { team: slot.team, x: Number(slot.pos_x), y: Number(slot.pos_y) }
        : (arranged[slot.squad_row_id] ?? {
            team: slot.team,
            x: 50,
            y: slot.team === 'black' ? 25 : 75,
          });
  }

  return spots;
}
