import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { createTeam, deleteTeam, renameTeam, setTeamSlot } from './actions';

const SLOT_LABELS: Record<number, string> = { 1: '1. takım', 2: '2. takım' };

export default async function TeamsPage() {
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, active_slot')
    .order('active_slot', { ascending: true, nullsFirst: false })
    .order('name');
  if (error) throw new Error(error.message);

  const teams = data ?? [];
  const slotOne = teams.find((t) => t.active_slot === 1);
  const slotTwo = teams.find((t) => t.active_slot === 2);

  return (
    <AppShell
      profile={profile}
      title="Takımlar"
      subtitle="Takımları bir kez tanımla, sahaya çıkacak ikisini seç. Kadro dağıtımı hep bu iki takıma yapılır."
    >
      <section className="flex flex-col gap-3">
        <h2 className="section-title">Sahadaki takımlar</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2].map((slot) => {
            const team = slot === 1 ? slotOne : slotTwo;
            return (
              <div key={slot} className="card card-pad">
                <p className="text-xs uppercase tracking-wide text-ink-300">{SLOT_LABELS[slot]}</p>
                <p className="mt-1 text-lg font-semibold text-frost-100">
                  {team ? (team.name as string) : 'Seçilmedi'}
                </p>
                {!team && (
                  <p className="hint mt-1">
                    Aşağıdaki listeden bir takımı bu sıraya al; yeni açılan maçlar bu adı kullanır.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Yeni takım tanımla</h2>

        <form action={createTeam} className="card card-pad flex flex-col gap-3">
          <div className="field">
            <label className="label" htmlFor="name">
              Takım adı
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={24}
              placeholder="Örn. Siyah, Kırmızı, Numune"
              className="input"
            />
            <p className="hint">
              Yelek rengi ya da takım adı. Tanımlı takım silinmez, istediğin zaman tekrar
              sahaya alırsın.
            </p>
          </div>
          <button className="btn btn-primary btn-block">Takımı ekle</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Tanımlı takımlar <span className="badge badge-muted">{teams.length}</span>
        </h2>

        {teams.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Henüz takım yok. Yukarıdan ekle; iki takım seçilene kadar maçlarda Siyah / Beyaz
            kullanılır.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {teams.map((team) => {
              const id = team.id as string;
              const slot = team.active_slot as number | null;

              return (
                <li key={id} className="card card-pad">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-frost-100">{team.name as string}</h3>
                      {slot ? (
                        <span className="badge badge-live">{SLOT_LABELS[slot]}</span>
                      ) : (
                        <span className="badge badge-muted">Sahada değil</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {slot !== 1 && (
                        <form action={setTeamSlot.bind(null, id, 1)}>
                          <button className="btn btn-ghost btn-sm">1. takım yap</button>
                        </form>
                      )}
                      {slot !== 2 && (
                        <form action={setTeamSlot.bind(null, id, 2)}>
                          <button className="btn btn-ghost btn-sm">2. takım yap</button>
                        </form>
                      )}
                      {slot !== null && (
                        <form action={setTeamSlot.bind(null, id, null)}>
                          <button className="btn btn-ghost btn-sm">Sahadan çıkar</button>
                        </form>
                      )}
                    </div>
                  </div>

                  <details className="mt-3 border-t border-[color:var(--line)] pt-3">
                    <summary className="cursor-pointer text-sm font-medium text-azure-400">
                      Düzenle
                    </summary>

                    <form
                      action={renameTeam.bind(null, id)}
                      className="mt-3 flex flex-wrap items-end gap-2"
                    >
                      <div className="field min-w-0 flex-1">
                        <label className="label">Takım adı</label>
                        <input
                          name="name"
                          type="text"
                          required
                          maxLength={24}
                          defaultValue={team.name as string}
                          className="input"
                        />
                      </div>
                      <button className="btn btn-ghost btn-sm">Kaydet</button>
                    </form>

                    {slot === null && (
                      <form action={deleteTeam.bind(null, id)} className="mt-3">
                        <button className="btn btn-danger btn-sm">Takımı sil</button>
                      </form>
                    )}

                    <p className="hint mt-3">
                      Ad değişikliği yalnızca bundan sonra açılacak maçlara işler; oynanmış
                      maçlar oynandıkları adla kalır.
                    </p>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
