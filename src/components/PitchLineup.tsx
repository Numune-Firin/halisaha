'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { SquadMember } from '@/lib/db/squad';
import { POSITION_SHORT } from '@/lib/ui/position';
import { ToastForm } from '@/components/ToastForm';
import type { ActionResult } from '@/lib/actions/result';
import {
  applyFormation,
  arrangeLineup,
  clampToPitch,
  formationsFor,
  isEvenSplit,
  suggestLineup,
  teamForY,
  type LineupSpot,
  type LineupTeam,
} from '@/lib/poll/lineup';

/**
 * Saha uzerinde diziliş kurma.
 *
 * Oyuncu jetonu parmakla ya da fareyle surukleniyor: ust yariya birakilan
 * bir takima, alt yariya birakilan digerine gecer. Sahanin disina birakilan
 * oyuncu asagidaki havuza doner.
 *
 * Konumlar sahanin yuzdesi olarak tutulur (0-100), boylece ekran boyu
 * degisince diziliş bozulmaz.
 */

type Spots = Record<string, LineupSpot>;

interface DragState {
  id: string;
  pointerId: number;
  /** Jetonun merkezine gore tutma noktasi; jeton parmagin altindan kacmasin */
  offsetX: number;
  offsetY: number;
}

export function PitchLineup({
  squad,
  blackName,
  whiteName,
  action,
  initialSpots,
  showRatings = true,
  submitLabel = 'Dizilişi kaydet',
  note,
}: {
  squad: SquadMember[];
  blackName: string;
  whiteName: string;
  action: (formData: FormData) => Promise<ActionResult>;
  /** Kayitli diziliş; bos ise yildizlara gore dengeli bir oneriyle acilir */
  initialSpots?: Spots;
  showRatings?: boolean;
  submitLabel?: string;
  note?: string;
}) {
  const people = squad.map((m) => ({ id: m.id, position: m.position, rating: m.rating }));
  const hasSaved = initialSpots !== undefined && Object.keys(initialSpots).length > 0;

  const [spots, setSpots] = useState<Spots>(() =>
    hasSaved ? (initialSpots as Spots) : suggestLineup(people),
  );
  const [isSuggestion, setIsSuggestion] = useState(!hasSaved);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Secili taktik yalnizca ekranda durur; kaydedilen sey oyuncularin konumu
  const [formations, setFormations] = useState<Record<LineupTeam, string>>({
    black: '',
    white: '',
  });

  const pitchRef = useRef<HTMLDivElement>(null);

  const pool = squad.filter((m) => !spots[m.id]);
  const onPitch = (team: LineupTeam) => squad.filter((m) => spots[m.id]?.team === team);

  /** Ekran noktasini sahanin yuzdesine cevirir; saha disi null doner. */
  function toPitchPercent(clientX: number, clientY: number) {
    const box = pitchRef.current?.getBoundingClientRect();
    if (!box) return null;

    const x = ((clientX - box.left) / box.width) * 100;
    const y = ((clientY - box.top) / box.height) * 100;
    // Kenardan bir miktar disari tasmaya izin verilir; cok uzaksa havuza doner
    if (x < -12 || x > 112 || y < -12 || y > 112) return null;
    return { x: clampToPitch(x), y: clampToPitch(y) };
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>, id: string) {
    const token = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id,
      pointerId: event.pointerId,
      offsetX: event.clientX - (token.left + token.width / 2),
      offsetY: event.clientY - (token.top + token.height / 2),
    });
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = toPitchPercent(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    if (!point) return;

    setIsSuggestion(false);
    setSpots((prev) => ({
      ...prev,
      [drag.id]: { team: teamForY(point.y), x: point.x, y: point.y },
    }));
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = toPitchPercent(event.clientX - drag.offsetX, event.clientY - drag.offsetY);

    setIsSuggestion(false);
    setSpots((prev) => {
      const next = { ...prev };
      if (point) next[drag.id] = { team: teamForY(point.y), x: point.x, y: point.y };
      // Saha disina birakilan oyuncu havuza doner
      else delete next[drag.id];
      return next;
    });
    setDrag(null);
  }

  /** Havuzdaki oyuncuyu tiklamayla sahaya alir; dokunmatikte kolaylik olsun diye. */
  function sendToPitch(id: string, team: LineupTeam) {
    const person = people.find((p) => p.id === id);
    if (!person) return;

    setIsSuggestion(false);
    setSpots((prev) => {
      const teams: Record<string, LineupTeam> = { [id]: team };
      for (const [otherId, spot] of Object.entries(prev)) teams[otherId] = spot.team;
      // Yalnizca yeni gelen dizilir; digerlerinin konumu korunur
      const placed = arrangeLineup([person], teams);
      return { ...prev, [id]: placed[id] ?? { team, x: 50, y: team === 'black' ? 25 : 75 } };
    });
  }

  function autoArrange() {
    const teams: Record<string, LineupTeam> = {};
    for (const [id, spot] of Object.entries(spots)) teams[id] = spot.team;
    setSpots(arrangeLineup(people, teams));
    setIsSuggestion(false);
  }

  function rebalance() {
    setSpots(suggestLineup(people));
    setIsSuggestion(true);
  }

  function clearPitch() {
    setSpots({});
    setIsSuggestion(false);
  }

  /** Secilen taktige gore o takimi yeniden dizer; karsi takima dokunmaz. */
  function setFormation(team: LineupTeam, formation: string) {
    if (!formation) return;
    setFormations((prev) => ({ ...prev, [team]: formation }));
    setSpots((prev) => applyFormation(people, team, formation, prev));
    setIsSuggestion(false);
  }

  /** O takimda kaleci mevkili biri var mi: taktik listesi buna gore degisir. */
  const hasKeeper = (team: LineupTeam) =>
    onPitch(team).some((m) => m.position === 'goalkeeper');

  // Takimlar denk olmali. Tek sayili kadroda esitlik mumkun olmadigi icin
  // bir kisilik fark kabul edilir; iki ve uzeri fark kaydedilemez.
  const blackCount = onPitch('black').length;
  const whiteCount = onPitch('white').length;
  const isUneven = !isEvenSplit(blackCount, whiteCount);

  const teamStars = (team: LineupTeam) => {
    const rated = onPitch(team).filter((m) => m.rating !== null);
    if (rated.length === 0) return null;
    return rated.reduce((sum, m) => sum + (m.rating as number), 0) / rated.length;
  };

  return (
    <ToastForm action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lineup" value={JSON.stringify(serialize(spots))} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-muted">{pool.length} bekliyor</span>
        <button type="button" onClick={autoArrange} className="btn btn-ghost btn-sm">
          Otomatik diz
        </button>
        {showRatings && (
          <button type="button" onClick={rebalance} className="btn btn-ghost btn-sm">
            Yıldıza göre dengele
          </button>
        )}
        <button type="button" onClick={clearPitch} className="btn btn-ghost btn-sm">
          Sahayı boşalt
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(['black', 'white'] as const).map((team) => {
          const options = formationsFor(onPitch(team).length, hasKeeper(team));
          return (
            <label key={team} className="field">
              <span className="label">
                {team === 'black' ? blackName : whiteName} taktiği
              </span>
              <select
                value={formations[team]}
                onChange={(e) => setFormation(team, e.target.value)}
                disabled={options.length === 0}
                className="input"
              >
                <option value="">Seç…</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <div
        ref={pitchRef}
        className="pitch"
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="pitch-half-label pitch-half-top">
          {blackName}
          <span className="pitch-count">{onPitch('black').length}</span>
          {showRatings && teamStars('black') !== null && (
            <span className="pitch-stars">★ {(teamStars('black') as number).toFixed(1)}</span>
          )}
        </div>
        <div className="pitch-half-label pitch-half-bottom">
          {whiteName}
          <span className="pitch-count">{onPitch('white').length}</span>
          {showRatings && teamStars('white') !== null && (
            <span className="pitch-stars">★ {(teamStars('white') as number).toFixed(1)}</span>
          )}
        </div>

        {squad.map((m) => {
          const spot = spots[m.id];
          if (!spot) return null;
          return (
            <button
              key={m.id}
              type="button"
              onPointerDown={(e) => startDrag(e, m.id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              className={`token ${spot.team === 'black' ? 'token-black' : 'token-white'} ${
                drag?.id === m.id ? 'token-dragging' : ''
              }`}
              aria-label={`${m.fullName}, ${spot.team === 'black' ? blackName : whiteName}`}
            >
              <span className="token-dot">
                {m.position ? POSITION_SHORT[m.position] : '•'}
              </span>
              <span className="token-name">{m.fullName}</span>
            </button>
          );
        })}
      </div>

      {pool.length > 0 && (
        <section className="card card-pad flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-frost-100">Sahaya girmeyi bekleyenler</h3>
          <ul className="flex flex-col gap-1.5">
            {pool.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{m.fullName}</span>
                {showRatings && m.rating !== null && (
                  <span className="text-xs text-amber-400">★ {m.rating.toFixed(1)}</span>
                )}
                {m.position && (
                  <span className="badge badge-muted">{POSITION_SHORT[m.position]}</span>
                )}
                {(['black', 'white'] as const).map((team) => (
                  <button
                    key={team}
                    type="button"
                    onClick={() => sendToPitch(m.id, team)}
                    className="btn btn-ghost btn-sm"
                  >
                    {team === 'black' ? blackName : whiteName}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <p className="hint">
            Oyuncuyu sahadan aşağı sürüklersen buraya döner. Buradan da bir takıma basarak
            sahaya alabilirsin.
          </p>
        </section>
      )}

      {isUneven && (
        <p className="card card-pad text-center text-sm text-red-300">
          Takımlar denk değil: <strong>{blackName} {blackCount}</strong> ·{' '}
          <strong>{whiteName} {whiteCount}</strong>. Kaydedebilmek için aradaki fark en fazla
          bir kişi olmalı.
        </p>
      )}

      {isSuggestion && !isUneven && (
        <p className="hint text-center">
          {note ??
            'Bu diziliş bir öneri: yıldız ortalamasına göre iki tarafı dengeliyor, kalecileri ayırıyor. Henüz kaydedilmedi — oyuncuları sürükleyip değiştir, sonra kaydet.'}
        </p>
      )}

      <button type="submit" disabled={isUneven} className="btn btn-primary btn-block">
        {submitLabel}
      </button>

      {pool.length > 0 && (
        <p className="hint text-center">
          {pool.length} oyuncu sahada değil. Sahaya koymadığın oyuncu maçı oynamamış sayılır.
        </p>
      )}
    </ToastForm>
  );
}

/** Sunucunun bekledigi bicim: [{id, team, x, y}] */
function serialize(spots: Spots) {
  return Object.entries(spots).map(([id, spot]) => ({
    id,
    team: spot.team,
    x: spot.x,
    y: spot.y,
  }));
}
