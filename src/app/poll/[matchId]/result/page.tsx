import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { getSquad } from '@/lib/db/squad';
import { formatKickoff } from '@/lib/ui/format';
import { clearResult, refreshTeamNames, saveResult, saveTeams } from './actions';
import { PitchLineup } from '@/components/PitchLineup';
import { spotsFromSquad } from '@/lib/poll/lineup-data';
import { ToastForm } from '@/components/ToastForm';

export default async function ResultPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServerSupabase();
  const { data: match, error } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, black_score, white_score, black_team_name, white_team_name')
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!match) notFound();

  const squad = await getSquad(matchId);
  const blackName = (match.black_team_name as string) || 'Siyah';
  const whiteName = (match.white_team_name as string) || 'Beyaz';

  // Adlar mac dogarken kopyalanir. Takimlar sonradan degistiyse admin'e
  // "guncelle" dugmesi gosterilir; oynanmis maclar oldugu gibi kalir.
  const { data: activeTeams } = await supabase
    .from('teams')
    .select('name, active_slot')
    .not('active_slot', 'is', null);
  const currentBlack = (activeTeams ?? []).find((t) => t.active_slot === 1)?.name as
    | string
    | undefined;
  const currentWhite = (activeTeams ?? []).find((t) => t.active_slot === 2)?.name as
    | string
    | undefined;
  const namesAreStale =
    match.status === 'squad_locked' &&
    ((currentBlack !== undefined && currentBlack !== blackName) ||
      (currentWhite !== undefined && currentWhite !== whiteName));
  const isPollOpen = match.status === 'poll_open';
  const hasResult = match.black_score !== null && match.white_score !== null;

  return (
    <AppShell
      profile={profile}
      title="Takımlar ve skor"
      subtitle={`${formatKickoff(match.kickoff_at as string)} · ${match.venue || 'Saha belirtilmedi'}`}
    >
      {isPollOpen ? (
        <div className="card card-pad flex flex-col gap-3 text-sm text-ink-300">
          <p>
            Bu maçın anketi hâlâ açık. Takım dağılımı ve skor, kadro kesinleştikten sonra
            girilebilir.
          </p>
          <Link href={`/poll/${matchId}/squad`} className="btn btn-primary btn-sm self-start">
            Kadroyu kesinleştir
          </Link>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="section-title">Takım dağılımı</h2>
            <p className="hint">
              Takım adları <strong>Takımlar</strong> sayfasından gelir; burada değiştirilmez.
            </p>

            {namesAreStale && (
              <ToastForm action={refreshTeamNames.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
                <p className="text-sm text-ink-300">
                  Sahadaki takımlar değişmiş: şu an <strong>{currentBlack}</strong> /{' '}
                  <strong>{currentWhite}</strong>. Bu maçta hâlâ {blackName} / {whiteName}{' '}
                  yazıyor.
                </p>
                <button className="btn btn-ghost btn-sm self-start">Adları güncelle</button>
              </ToastForm>
            )}

            <PitchLineup
              squad={squad}
              initialSpots={spotsFromSquad(squad)}
              blackName={blackName}
              whiteName={whiteName}
              action={saveTeams.bind(null, matchId)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="section-title">Skor</h2>

            <ToastForm action={saveResult.bind(null, matchId)} className="card card-pad flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="field">
                  <label className="label" htmlFor="blackScore">
                    {blackName}
                  </label>
                  <input
                    id="blackScore"
                    name="blackScore"
                    type="number"
                    min={0}
                    required
                    defaultValue={(match.black_score as number | null) ?? ''}
                    className="input"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="whiteScore">
                    {whiteName}
                  </label>
                  <input
                    id="whiteScore"
                    name="whiteScore"
                    type="number"
                    min={0}
                    required
                    defaultValue={(match.white_score as number | null) ?? ''}
                    className="input"
                  />
                </div>
              </div>
              <p className="hint">
                Skor kaydedilince maç &quot;Oynandı&quot; durumuna geçer ve puan durumuna işler.
                Sonradan düzeltirsen sıralama da güncellenir.
              </p>
              <button className="btn btn-primary btn-block">Skoru kaydet</button>
            </ToastForm>

            <Link href={`/poll/${matchId}/payments`} className="btn btn-ghost btn-block">
              Ödemelere geç
            </Link>

            {hasResult && (
              <ToastForm action={clearResult.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
                <p className="text-sm text-ink-300">
                  Skoru silersen maç kadro kesin durumuna döner ve puan durumundan çıkar.
                </p>
                <button className="btn btn-danger btn-sm self-start">Skoru sil</button>
              </ToastForm>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
