'use client';

import { useState } from 'react';
import type { SquadMember } from '@/lib/db/squad';
import type { Team } from '@/lib/standings/table';
import { POSITION_SHORT } from '@/lib/ui/position';
import { balanceTeams } from '@/lib/poll/balance';
import { ToastForm } from '@/components/ToastForm';
import type { ActionResult } from '@/lib/actions/result';

type Choice = Team | '';

/**
 * Solda kadro havuzu, sagda iki takim durur. Oyuncu havuzdan bir takima
 * gonderilir, takimdan tiklanarak havuza geri doner; boylece admin listenin
 * tamamini tek ekranda gorur.
 *
 * Takim adlari burada degistirilemez: kaynak "Takimlar" sayfasidir, mac
 * dogarken o anki iki aktif takimin adi bu maca kopyalanmistir. Kayitta
 * 'black'/'white' durdugu icin ad degismesi eski maclari ve puan durumunu
 * bozmaz.
 */
export function TeamPicker({
  squad,
  blackName,
  whiteName,
  action,
}: {
  squad: SquadMember[];
  blackName: string;
  whiteName: string;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  // Takimlar daha once kaydedilmediyse ekran bos gelmesin: yildizlara gore
  // dengeli bir oneriyle acilir, yonetici begenmezse tek tiklamayla degistirir.
  const hasSavedTeams = squad.some((m) => m.team);
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    hasSavedTeams
      ? Object.fromEntries(squad.map((m) => [m.id, m.team ?? '']))
      : suggest(squad),
  );
  const [isSuggestion, setIsSuggestion] = useState(!hasSavedTeams);
  const names: Record<Team, string> = { black: blackName, white: whiteName };

  const assign = (id: string, team: Choice) => {
    setIsSuggestion(false);
    setChoices((prev) => ({ ...prev, [id]: team }));
  };

  const pool = squad.filter((m) => !choices[m.id]);
  const membersOf = (team: Team) => squad.filter((m) => choices[m.id] === team);

  /** Havuzdaki oyunculari sirayla iki takima bolusturur. */
  const spread = () => {
    setIsSuggestion(false);
    setChoices((prev) => {
      const next = { ...prev };
      let turn = membersOf('black').length > membersOf('white').length ? 1 : 0;
      for (const m of pool) {
        next[m.id] = turn % 2 === 0 ? 'black' : 'white';
        turn += 1;
      }
      return next;
    });
  };

  /** Butun kadroyu yildizlara gore yeniden dengeler. */
  const rebalance = () => {
    setChoices(suggest(squad));
    setIsSuggestion(true);
  };

  const teamStars = (team: Team) => {
    const members = membersOf(team);
    if (members.length === 0) return null;
    const rated = members.filter((m) => m.rating !== null);
    if (rated.length === 0) return null;
    return rated.reduce((sum, m) => sum + (m.rating as number), 0) / rated.length;
  };

  return (
    <ToastForm action={action} className="flex flex-col gap-3">
      {squad.map((m) =>
        choices[m.id] ? (
          <input key={m.id} type="hidden" name={`team:${m.id}`} value={choices[m.id]} />
        ) : null,
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card flex flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-[color:var(--line)] px-4 py-3">
            <h3 className="text-sm font-semibold text-frost-100">Kadro</h3>
            <div className="flex items-center gap-2">
              <span className="badge badge-muted">{pool.length} bekliyor</span>
              <button type="button" onClick={rebalance} className="btn btn-ghost btn-sm">
                Yıldıza göre dengele
              </button>
              {pool.length > 0 && (
                <button type="button" onClick={spread} className="btn btn-ghost btn-sm">
                  Sırayla dağıt
                </button>
              )}
            </div>
          </header>

          {pool.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-300">
              Herkesin takımı belli. Aşağıdan kaydet.
            </p>
          ) : (
            <ul className="divide-line">
              {pool.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{m.fullName}</span>
                  {m.rating !== null && (
                    <span className="text-xs text-amber-400">★ {m.rating.toFixed(1)}</span>
                  )}
                  {m.position && <span className="badge badge-muted">{POSITION_SHORT[m.position]}</span>}
                  {m.isGuest && !m.isRegular && <span className="badge badge-muted">Aday</span>}
                  {(['black', 'white'] as const).map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => assign(m.id, team)}
                      className="btn btn-ghost btn-sm"
                    >
                      {names[team]}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-3">
          {(['black', 'white'] as const).map((team) => {
            const members = membersOf(team);
            return (
              <section key={team} className="card flex flex-col">
                <header className="flex items-center gap-2 border-b border-[color:var(--line)] px-4 py-3">
                  <h3 className="min-w-0 flex-1 truncate font-semibold text-frost-100">
                    {names[team]}
                  </h3>
                  <span className="badge badge-muted shrink-0">{members.length} kişi</span>
                  {teamStars(team) !== null && (
                    <span className="badge badge-vip shrink-0">
                      ★ {(teamStars(team) as number).toFixed(1)}
                    </span>
                  )}
                </header>

                {members.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-ink-300">
                    Soldaki listeden oyuncu seç.
                  </p>
                ) : (
                  <ul className="divide-line">
                    {members.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 px-4 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-sm text-ink-100">
                          {m.fullName}
                        </span>
                        {m.rating !== null && (
                          <span className="text-xs text-amber-400">★ {m.rating.toFixed(1)}</span>
                        )}
                        {m.position && (
                          <span className="badge badge-muted">{POSITION_SHORT[m.position]}</span>
                        )}
                        {m.isGuest && !m.isRegular && (
                          <span className="badge badge-muted">Aday</span>
                        )}
                        <button
                          type="button"
                          onClick={() => assign(m.id, '')}
                          aria-label={`${m.fullName} oyuncusunu kadroya geri al`}
                          className="btn btn-ghost btn-sm"
                        >
                          Geri al
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {isSuggestion && (
        <p className="hint text-center">
          Bu dağılım bir <strong>öneri</strong>: oyuncuların yıldız ortalamasına göre iki tarafı
          dengeliyor, kalecileri ayırıyor. Henüz kaydedilmedi — beğenmezsen değiştir, sonra
          kaydet.
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block">
        Takımları kaydet
      </button>

      {pool.length > 0 && (
        <p className="hint text-center">
          {pool.length} oyuncunun takımı seçilmedi. Takımsız kalan oyuncu maçı oynamamış sayılır
          ve puan durumuna girmez.
        </p>
      )}
    </ToastForm>
  );
}

/** Kadroyu yildizlara gore ikiye boler; sonuc formun bekledigi bicimde doner. */
function suggest(squad: SquadMember[]): Record<string, Choice> {
  const teams = balanceTeams(
    squad.map((m) => ({ id: m.id, rating: m.rating, position: m.position })),
  );
  return Object.fromEntries(squad.map((m) => [m.id, teams[m.id] ?? '']));
}
