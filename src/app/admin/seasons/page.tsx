import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { formatDay } from '@/lib/ui/format';
import { activateSeason, closeSeason, createSeason, updateSeason } from './actions';

type SeasonRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
};

export default async function SeasonsPage() {
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServerSupabase();

  const { data: seasons, error } = await supabase
    .from('seasons')
    .select('id, name, starts_on, ends_on, is_active')
    .order('starts_on', { ascending: false });
  if (error) throw new Error(error.message);

  const { data: matchCounts } = await supabase.from('matches').select('season_id');
  const matchesPerSeason = new Map<string, number>();
  for (const row of matchCounts ?? []) {
    const id = row.season_id as string | null;
    if (id) matchesPerSeason.set(id, (matchesPerSeason.get(id) ?? 0) + 1);
  }

  const rows = (seasons ?? []) as SeasonRow[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell
      profile={profile}
      title="Sezonlar"
      subtitle="Sezon; başlangıç ve bitiş tarihi olan bir dönemdir. Açılan her maç o an aktif olan sezona yazılır, puan durumu da sezona göre hesaplanır."
    >
      <section className="flex flex-col gap-3">
        <h2 className="section-title">Yeni sezon tanımla</h2>
        <form action={createSeason} className="card card-pad flex flex-col gap-4">
          <div className="field">
            <label className="label" htmlFor="name">
              Sezon adı
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Örn. 2026 Güz Sezonu"
              className="input"
            />
            <p className="hint">Puan durumu ve maç listelerinde bu isim görünür.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="startsOn">
                Başlangıç tarihi
              </label>
              <input
                id="startsOn"
                name="startsOn"
                type="date"
                required
                defaultValue={today}
                className="input"
              />
              <p className="hint">Sezonun ilk günü.</p>
            </div>

            <div className="field">
              <label className="label" htmlFor="endsOn">
                Bitiş tarihi
              </label>
              <input id="endsOn" name="endsOn" type="date" className="input" />
              <p className="hint">
                Sezonun son günü. Şimdiden belli değilse boş bırak, kapatırken yazılır.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-ink-100">
            <input
              type="checkbox"
              name="makeActive"
              defaultChecked
              className="mt-0.5 h-4 w-4 accent-[var(--color-azure-400)]"
            />
            <span>
              Bu sezonu aktif yap
              <span className="mt-0.5 block text-xs text-ink-300">
                Aynı anda tek bir sezon aktif olabilir; işaretlersen mevcut aktif sezon kapanır.
              </span>
            </span>
          </label>

          <button className="btn btn-primary btn-block">Sezonu oluştur</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Tanımlı sezonlar</h2>

        {rows.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Henüz sezon yok. Yukarıdan ilk sezonu tanımla.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((season) => (
              <li key={season.id} className="card card-pad">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-frost-100">{season.name}</h3>
                      {season.is_active ? (
                        <span className="badge badge-live">Aktif</span>
                      ) : (
                        <span className="badge badge-muted">Kapalı</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-300">
                      {formatDay(season.starts_on)} →{' '}
                      {season.ends_on ? formatDay(season.ends_on) : 'devam ediyor'}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {matchesPerSeason.get(season.id) ?? 0} maç bu sezona bağlı
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {season.is_active ? (
                      <form action={closeSeason.bind(null, season.id)}>
                        <button className="btn btn-ghost btn-sm">Sezonu kapat</button>
                      </form>
                    ) : (
                      <form action={activateSeason.bind(null, season.id)}>
                        <button className="btn btn-go btn-sm">Aktif yap</button>
                      </form>
                    )}
                  </div>
                </div>

                <details className="mt-3 border-t border-[color:var(--line)] pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-azure-400">
                    Düzenle
                  </summary>
                  <form
                    action={updateSeason.bind(null, season.id)}
                    className="mt-3 flex flex-col gap-3"
                  >
                    <div className="field">
                      <label className="label">Sezon adı</label>
                      <input
                        name="name"
                        type="text"
                        required
                        defaultValue={season.name}
                        className="input"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="field">
                        <label className="label">Başlangıç</label>
                        <input
                          name="startsOn"
                          type="date"
                          required
                          defaultValue={season.starts_on}
                          className="input"
                        />
                      </div>
                      <div className="field">
                        <label className="label">Bitiş</label>
                        <input
                          name="endsOn"
                          type="date"
                          defaultValue={season.ends_on ?? ''}
                          className="input"
                        />
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm self-start">Kaydet</button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
