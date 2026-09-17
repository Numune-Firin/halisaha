import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getCurrentProfile } from '@/lib/supabase/server';
import { getStandings, listSeasons } from '@/lib/db/standings';

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const { season: seasonParam } = await searchParams;
  const seasons = await listSeasons();
  const selected =
    seasons.find((s) => s.id === seasonParam) ?? seasons.find((s) => s.isActive) ?? seasons[0];

  if (!selected) {
    return (
      <AppShell profile={profile} title="Puan durumu" subtitle="Henüz sezon tanımlanmadı.">
        <div className="card card-pad text-sm text-ink-300">
          Puan durumu sezon bazında tutulur.{' '}
          {profile.role === 'admin' ? (
            <>
              <Link href="/admin/seasons" className="text-azure-400 underline">
                Önce bir sezon tanımla
              </Link>
              .
            </>
          ) : (
            'Yönetici bir sezon tanımladığında burada görünecek.'
          )}
        </div>
      </AppShell>
    );
  }

  const rows = await getStandings(selected.id);

  return (
    <AppShell
      profile={profile}
      title="Puan durumu"
      subtitle={`${selected.name} · galibiyet 3, beraberlik 1, mağlubiyet 0 puan`}
    >
      {seasons.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/standings?season=${s.id}`}
              className={`btn btn-sm ${s.id === selected.id ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card card-pad text-sm text-ink-300">
          Bu sezonda skoru girilmiş maç yok. Bir maçın kadrosu kesinleşip takımlar ayrıldıktan ve
          skor girildikten sonra tablo burada oluşur.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--line)] text-xs uppercase tracking-wide text-ink-300">
                <th className="px-3 py-2.5 text-left font-medium">#</th>
                <th className="px-3 py-2.5 text-left font-medium">Oyuncu</th>
                <th className="px-2 py-2.5 text-center font-medium" title="Oynadığı maç">
                  O
                </th>
                <th className="px-2 py-2.5 text-center font-medium" title="Galibiyet">
                  G
                </th>
                <th className="px-2 py-2.5 text-center font-medium" title="Beraberlik">
                  B
                </th>
                <th className="px-2 py-2.5 text-center font-medium" title="Mağlubiyet">
                  M
                </th>
                <th
                  className="px-2 py-2.5 text-center font-medium"
                  title="Averaj: attığı gol − yediği gol"
                >
                  AV
                </th>
                <th
                  className="px-2 py-2.5 text-center font-medium"
                  title="Puan kazanma yüzdesi: aldığı puan / alabileceği puan"
                >
                  %
                </th>
                <th className="px-3 py-2.5 text-right font-medium" title="Puan">
                  P
                </th>
              </tr>
            </thead>
            <tbody className="divide-line">
              {rows.map((r, i) => (
                <tr key={r.participantId} className={r.participantId === profile.id ? 'bg-[color:var(--surface)]' : ''}>
                  <td className="px-3 py-2.5 text-ink-300">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-frost-100">{r.fullName}</span>
                    {r.isGuest && <span className="badge badge-muted ml-2">Aday</span>}
                  </td>
                  <td className="px-2 py-2.5 text-center text-ink-300">{r.played}</td>
                  <td className="px-2 py-2.5 text-center text-ink-300">{r.won}</td>
                  <td className="px-2 py-2.5 text-center text-ink-300">{r.drawn}</td>
                  <td className="px-2 py-2.5 text-center text-ink-300">{r.lost}</td>
                  <td className="px-2 py-2.5 text-center text-ink-300">
                    {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                  </td>
                  <td className="px-2 py-2.5 text-center text-ink-300">
                    %{Math.round(r.pointsRate * 100)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-azure-400">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        <strong>AV (averaj)</strong> = oyuncunun takımının attığı gol − yediği gol; oynadığı bütün
        maçların toplamı. <strong>%</strong> = alabileceği puanın yüzde kaçını aldığı (galibiyet 3
        puandan hesaplanır), böylece az maç oynayanla çok oynayan aynı ölçekte görülür.
        <br />
        Sıralama önce puana, eşitlik hâlinde averaja, sonra atılan gole bakar. Kadroda olup takımı
        işaretlenmemiş oyuncu o maçı oynamamış sayılır.
      </p>
    </AppShell>
  );
}
