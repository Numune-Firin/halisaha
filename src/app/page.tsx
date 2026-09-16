import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { getCurrentProfile, createServerSupabase } from '@/lib/supabase/server';
import { ensureScheduledMatches } from '@/lib/db/schedule';
import {
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
    .select('name')
    .eq('is_active', true)
    .maybeSingle();

  const { data: matches } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, squad_size, fee_per_player')
    .in('status', ['poll_open', 'squad_locked'])
    .order('kickoff_at', { ascending: true })
    .limit(5);

  const upcoming = matches ?? [];

  return (
    <AppShell
      profile={profile}
      title={`Merhaba, ${(profile.full_name || 'oyuncu').split(' ')[0]}`}
      subtitle={season ? `Aktif sezon: ${season.name}` : 'Henüz aktif bir sezon tanımlanmadı.'}
    >
      <section className="flex flex-col gap-3">
        <h2 className="section-title">Yaklaşan maçlar</h2>

        {upcoming.length === 0 && (
          <div className="card card-pad text-sm text-ink-300">
            Şu anda açık anket yok. Yönetici yeni anketi açtığında burada görünecek.
          </div>
        )}

        {upcoming.map((m) => {
          const status = m.status as MatchStatus;
          return (
            <Link key={m.id} href={`/poll/${m.id}`} className="card card-link card-pad">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-cream-100">
                    {formatKickoff(m.kickoff_at as string)}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-300">{m.venue || 'Saha belirtilmedi'}</div>
                </div>
                <span className={MATCH_STATUS_BADGES[status]}>{MATCH_STATUS_LABELS[status]}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
                <span>Kadro {m.squad_size} kişi</span>
                <span>Kişi başı {Number(m.fee_per_player ?? 0).toLocaleString('tr-TR')} ₺</span>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Nasıl işliyor?</h2>
        <ul className="card divide-line text-sm">
          <li className="card-pad text-ink-300">
            <span className="font-semibold text-cream-100">Ankete gir.</span> Ankete ilk giren
            oyuncular kadroyu doldurur, sonrakiler yedek listesine yazılır.
          </li>
          <li className="card-pad text-ink-300">
            <span className="font-semibold text-cream-100">Sıralama üç katman.</span> Önce VIP,
            sonra öncelikli, en son normal girişler gelir.
          </li>
          <li className="card-pad text-ink-300">
            <span className="font-semibold text-cream-100">Geç çıkışın bedeli var.</span> Serbest
            çıkış süresi dolduktan sonra listeden çıkarsan bir sonraki ankette sıran geriye düşer.
          </li>
        </ul>
      </section>
    </AppShell>
  );
}
