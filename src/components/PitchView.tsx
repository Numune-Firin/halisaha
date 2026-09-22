import type { SquadMember } from '@/lib/db/squad';
import { POSITION_SHORT } from '@/lib/ui/position';
import type { LineupSpot } from '@/lib/poll/lineup';

/**
 * Sahayi okunur halde gosterir: surukleme yok, yalnizca kimin nerede
 * durdugunu anlatir. Onerileri listelerken kullanilir.
 */
export function PitchView({
  squad,
  spots,
  blackName,
  whiteName,
}: {
  squad: SquadMember[];
  spots: Record<string, LineupSpot>;
  blackName: string;
  whiteName: string;
}) {
  const count = (team: 'black' | 'white') =>
    squad.filter((m) => spots[m.id]?.team === team).length;

  return (
    <div className="pitch">
      <div className="pitch-half-label pitch-half-top">
        {blackName}
        <span className="pitch-count">{count('black')}</span>
      </div>
      <div className="pitch-half-label pitch-half-bottom">
        {whiteName}
        <span className="pitch-count">{count('white')}</span>
      </div>

      {squad.map((m) => {
        const spot = spots[m.id];
        if (!spot) return null;
        return (
          <span
            key={m.id}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            className={`token ${spot.team === 'black' ? 'token-black' : 'token-white'}`}
          >
            <span className="token-dot">{m.position ? POSITION_SHORT[m.position] : '•'}</span>
            <span className="token-name">{m.fullName.split(' ')[0]}</span>
          </span>
        );
      })}
    </div>
  );
}
