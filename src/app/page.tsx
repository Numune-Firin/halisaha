import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { getCurrentProfile, createServerSupabase } from '@/lib/supabase/server';
import { ensureScheduledMatches } from '@/lib/db/schedule';
import {
  displayStatus,
  formatKickoff,
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
  type MatchStatus,
} from '@/lib/ui/format';

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  // Anket takviminde vakti gelmis maclar burada acilir. Ucretsiz planda
  // zamanlanmis gorev olmadigi icin tetikleyici, uygulamayi acan ilk kisidir.
  await ensureScheduledMatches();

  const supabase = await createServerSupabase();

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .maybeSingle();

  // Ana sayfada yalnizca siradaki mac durur: mac saati gecmis anket artik
  // acik degildir, gecmis haftalar "Maclar" sayfasindan acilir.
  const { data: match } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, squad_size, fee_per_player, cancellation_reason, sponsor_name')
    .in('status', ['poll_open', 'squad_locked', 'cancelled'])
    .gt('kickoff_at', new Date().toISOString())
    .order('kickoff_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Anket acikken ankete girenler, kadro kesinlestikten sonra kadrodakiler
  // sayilir: kilitlendikten sonra "ankette kaç kişi var" bilgisi yanıltıyordu.
  const isPollStillOpen = match?.status === 'poll_open';
  let listedCount = 0;
  if (match) {
    const { count } = isPollStillOpen
      ? await supabase
          .from('match_entries')
          .select('id', { count: 'exact', head: true })
          .eq('match_id', match.id as string)
          .is('withdrawn_at', null)
      : await supabase
          .from('match_squad')
          .select('id', { count: 'exact', head: true })
          .eq('match_id', match.id as string);
    listedCount = count ?? 0;
  }

  let playedCount = 0;
  if (season) {
    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', season.id as string)
      .in('status', ['played', 'completed']);
    playedCount = count ?? 0;
  }

  const status = match
    ? displayStatus(match.status as MatchStatus, match.kickoff_at as string)
    : null;
  const isCancelled = status === 'cancelled';

  const stats = [
    {
      label: 'Sıradaki maç',
      value: match ? formatKickoff(match.kickoff_at as string) : 'Yok',
      hint: match ? (match.venue as string) || 'Saha belirtilmedi' : 'Açık anket bulunmuyor',
    },
    {
      label: isPollStillOpen ? 'Listede' : 'Kadro',
      value: match ? `${listedCount}/${match.squad_size}` : '—',
      hint: match
        ? isPollStillOpen
          ? 'Ankete giren oyuncu'
          : 'Kesinleşmiş kadro'
        : 'Anket açılınca dolar',
    },
    {
      label: 'Oynanan maç',
      value: String(playedCount),
      hint: season ? (season.name as string) : 'Aktif sezon yok',
    },
  ];

  return (
    <AppShell
      profile={profile}
      title={`Merhaba, ${(profile.full_name || 'oyuncu').split(' ')[0]}`}
      subtitle={season ? `Aktif sezon: ${season.name}` : 'Henüz aktif bir sezon tanımlanmadı.'}
    >
      <section className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="card card-pad">
            <p className="text-xs uppercase tracking-wide text-ink-300">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold leading-tight text-frost-100">{stat.value}</p>
            <p className="mt-0.5 text-xs text-ink-500">{stat.hint}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Aktif anket</h2>

        {!match || !status ? (
          <div className="card card-pad flex flex-col items-start gap-3 text-sm text-ink-300">
            <p>
              Şu anda açık anket yok. Takvimdeki gün geldiğinde anket kendiliğinden açılır ve
              burada görünür.
            </p>
            <Link href="/matches" className="btn btn-ghost btn-sm">
              Geçmiş maçlara bak
            </Link>
          </div>
        ) : (
          <Link href={`/poll/${match.id}`} className="card card-link card-pad">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-frost-100">
                  {formatKickoff(match.kickoff_at as string)}
                </div>
                <div className="mt-0.5 text-sm text-ink-300">
                  {isCancelled
                    ? (match.cancellation_reason as string | null) || 'Bu hafta iptal edildi'
                    : (match.venue as string) || 'Saha belirtilmedi'}
                </div>
              </div>
              <span className={MATCH_STATUS_BADGES[status]}>{MATCH_STATUS_LABELS[status]}</span>
            </div>

            {!isCancelled && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
                <span>
                  {isPollStillOpen ? 'Listede' : 'Kadro'} {listedCount}/{match.squad_size} kişi
                </span>
                <span>
                  Kişi başı {Number(match.fee_per_player ?? 0).toLocaleString('tr-TR')} ₺
                </span>
                {(match.sponsor_name as string) && (
                  <span className="badge badge-vip">
                    Haftanın sponsoru: {match.sponsor_name as string}
                  </span>
                )}
              </div>
            )}
          </Link>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Nasıl işliyor?</h2>
        <ul className="card divide-line text-sm">
          <li className="card-pad text-ink-300">
            <span className="font-semibold text-frost-100">Ankete gir.</span> Ankete ilk giren
            oyuncular kadroyu doldurur, sonrakiler yedek listesine yazılır.
          </li>
          <li className="card-pad text-ink-300">
            <span className="font-semibold text-frost-100">Sıralama üç katman.</span> Önce VIP,
            sonra öncelikli, en son normal girişler gelir.
          </li>
          <li className="card-pad text-ink-300">
            <span className="font-semibold text-frost-100">Geç çıkışın bedeli var.</span> Serbest
            çıkış süresi dolduktan sonra listeden çıkarsan bir sonraki ankette sıran geriye düşer.
          </li>
        </ul>
      </section>
    </AppShell>
  );
}
