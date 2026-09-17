'use client';

import { useState } from 'react';
import type { SquadMember } from '@/lib/db/squad';
import type { Team } from '@/lib/standings/table';
import { POSITION_SHORT } from '@/lib/ui/position';

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
  action: (formData: FormData) => Promise<void>;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(squad.map((m) => [m.id, m.team ?? ''])),
  );
  const names: Record<Team, string> = { black: blackName, white: whiteName };

  const assign = (id: string, team: Choice) =>
    setChoices((prev) => ({ ...prev, [id]: team }));

  const pool = squad.filter((m) => !choices[m.id]);
  const membersOf = (team: Team) => squad.filter((m) => choices[m.id] === team);

  /** Havuzdaki oyunculari sirayla iki takima bolusturur. */
  const spread = () => {
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

  return (
    <form action={action} className="flex flex-col gap-3">
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

      <button type="submit" className="btn btn-primary btn-block">
        Takımları kaydet
      </button>

      {pool.length > 0 && (
        <p className="hint text-center">
          {pool.length} oyuncunun takımı seçilmedi. Takımsız kalan oyuncu maçı oynamamış sayılır
          ve puan durumuna girmez.
        </p>
      )}
    </form>
  );
}
