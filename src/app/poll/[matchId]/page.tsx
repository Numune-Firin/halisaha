import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { getPoll } from '@/lib/db/poll';
import {
  formatKickoff,
  formatShort,
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
} from '@/lib/ui/format';
import { PollList } from './PollList';
import {
  adminAddNewGuest,
  adminAddParticipant,
  adminRemoveEntry,
  togglePollEntry,
} from './actions';
import { unlockSquad } from './squad/actions';
import { LiveRefresh } from './LiveRefresh';

const HOUR_MS = 60 * 60 * 1000;

export default async function PollPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const data = await getPoll(matchId);
  if (!data) notFound();

  const { match } = data;
  const isAdmin = profile.role === 'admin';
  const isPollOpen = match.status === 'poll_open';
  const isListed = data.rows.some((r) => r.playerId === profile.id);
  const freeUntil = new Date(
    new Date(match.kickoffAt).getTime() - match.withdrawalWindowHours * HOUR_MS,
  );
  const isFreeWindowOpen = Date.now() < freeUntil.getTime();

  // Elle ekleme listesi: zaten ankette olanlar disarida birakilir
  const listedIds = new Set(data.rows.map((r) => r.playerId));
  let addable: { value: string; label: string }[] = [];

  if (isAdmin && isPollOpen) {
    const supabase = await createServerSupabase();

    const { data: members, error: memberError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('status', 'active')
      .order('full_name');
    if (memberError) throw new Error(memberError.message);

    const { data: guests, error: guestError } = await supabase
      .from('guest_players')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name');
    if (guestError) throw new Error(guestError.message);

    addable = [
      ...(members ?? [])
        .filter((m) => !listedIds.has(m.id as string))
        .map((m) => ({
          value: `m:${m.id}`,
          label: (m.full_name as string) || 'İsimsiz oyuncu',
        })),
      ...(guests ?? [])
        .filter((g) => !listedIds.has(g.id as string))
        .map((g) => ({ value: `g:${g.id}`, label: `${g.full_name} (aday)` })),
    ];
  }

  return (
    <AppShell
      profile={profile}
      title={formatKickoff(match.kickoffAt)}
      subtitle={match.venue || 'Saha belirtilmedi'}
      action={<span className={MATCH_STATUS_BADGES[match.status]}>{MATCH_STATUS_LABELS[match.status]}</span>}
    >
      <LiveRefresh matchId={matchId} />

      <PollList
        rows={data.rows}
        squadSize={match.squadSize}
        showEmptySlots={isPollOpen}
        removeEntry={
          isAdmin && isPollOpen ? adminRemoveEntry.bind(null, matchId) : undefined
        }
      />

      {isAdmin && isPollOpen && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Yönetim</h2>

          <form
            action={adminAddParticipant.bind(null, matchId)}
            className="card card-pad flex flex-col gap-3"
          >
            <div className="field">
              <label className="label" htmlFor="participant">
                Listeye kişi ekle
              </label>
              <select id="participant" name="participant" className="input" defaultValue="">
                <option value="" disabled>
                  Seç…
                </option>
                {addable.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="hint">
                Üyeler ve daha önce tanımlanmış aday oyuncular. Eklenen kişi sıranın en
                sonuna yazılır.
              </p>
            </div>
            <button className="btn btn-ghost btn-sm self-start" disabled={addable.length === 0}>
              Ekle
            </button>
          </form>

          <form
            action={adminAddNewGuest.bind(null, matchId)}
            className="card card-pad flex flex-col gap-3"
          >
            <div className="field">
              <label className="label" htmlFor="fullName">
                Yeni aday oyuncu
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                placeholder="Adı soyadı"
                className="input"
              />
              <p className="hint">
                Gruba üye olmayan, Google hesabıyla girmeyen kişi. Bir kez tanımlanır,
                sonraki maçlarda listeden seçilir.
              </p>
            </div>

            <div className="field">
              <label className="label" htmlFor="position">
                Mevki
              </label>
              <select id="position" name="position" className="input" defaultValue="">
                <option value="">Belirtilmedi</option>
                <option value="goalkeeper">Kaleci</option>
                <option value="defender">Defans</option>
                <option value="midfielder">Orta saha</option>
                <option value="forward">Forvet</option>
              </select>
            </div>

            <button className="btn btn-ghost btn-sm self-start">Tanımla ve ekle</button>
          </form>

          <Link href={`/poll/${matchId}/squad`} className="btn btn-primary btn-block">
            Kadroyu kesinleştir
          </Link>
        </section>
      )}

      {isPollOpen && (
        <div className="sticky bottom-3 flex flex-col gap-2">
          <form
            action={async () => {
              'use server';
              // Karar render aninda yakalanan isListed'e gore degil,
              // togglePollEntry'nin o an veritabanindan okudugu duruma gore
              // verilir; buton metni yalnizca gorsel amacli render anini yansitir.
              await togglePollEntry(matchId);
            }}
          >
            <button type="submit" className={`btn btn-block ${isListed ? 'btn-danger' : 'btn-go'}`}>
              {isListed ? 'Anketten çık' : 'Ankete gir'}
            </button>
          </form>

          <p className="card card-pad text-center text-xs leading-relaxed text-ink-300">
            {isFreeWindowOpen ? (
              <>
                <span className="text-cream-100">{formatShort(freeUntil.toISOString())}</span>{' '}
                tarihine kadar cezasız çıkabilirsin. Sonrasında çıkarsan sonraki ankette giriş
                saatine {match.lateWithdrawalPenaltySeconds} saniye eklenir.
              </>
            ) : (
              <>
                Serbest çıkış süresi doldu. Şimdi çıkarsan sonraki ankette giriş saatine{' '}
                <span className="text-cream-100">{match.lateWithdrawalPenaltySeconds} saniye</span>{' '}
                ceza eklenir.
              </>
            )}
          </p>
        </div>
      )}

      {!isPollOpen && (
        <div className="card card-pad text-sm text-ink-300">
          Bu maçın anketi kapandı, liste kesinleşti.
        </div>
      )}

      {isAdmin && match.status === 'squad_locked' && (
        <form action={unlockSquad.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
          <p className="text-sm text-ink-300">
            Kadroyu geri alırsan anket yeniden açılır; listeye ekleme çıkarma yapıp tekrar
            kesinleştirebilirsin.
          </p>
          <button className="btn btn-danger btn-sm self-start">Kadroyu geri al</button>
        </form>
      )}
    </AppShell>
  );
}
