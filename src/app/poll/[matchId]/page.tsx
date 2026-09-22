import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { getPoll } from '@/lib/db/poll';
import {
  displayStatus,
  formatKickoff,
  formatShort,
  isPollLive,
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
} from '@/lib/ui/format';
import { POSITION_LABELS, POSITION_OPTIONS } from '@/lib/ui/position';
import type { Position } from '@/lib/poll/types';
import { PollList } from './PollList';
import {
  adminAddNewGuest,
  adminAddParticipant,
  adminRemoveEntry,
  cancelMatch,
  deleteMatch,
  markMatchPlayed,
  restoreMatch,
  updateMatchDetails,
  togglePollEntry,
} from './actions';
import { unlockSquad } from './squad/actions';
import { LiveRefresh } from './LiveRefresh';
import { ToastForm } from '@/components/ToastForm';

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
  // Mac saati gectiyse anket kendiliginden kapanir; durum kolonu degismese de
  // kimse giremez, admin de listeye ekleme yapamaz.
  const isPollOpen = isPollLive(match.status, match.kickoffAt, match.pollOpenedAt);
  const shownStatus = displayStatus(match.status, match.kickoffAt, match.pollOpenedAt);
  // Anket saati henuz gelmediyse kimse giremez; kural veritabaninda da var
  const isBeforePollOpens = shownStatus === 'upcoming';
  const isCancelled = match.status === 'cancelled';
  // Iptal edilmis hafta ve henuz acilmamis anket 'kapanmis anket' degildir
  const isClosedPoll = !isPollOpen && !isCancelled && !isBeforePollOpens;
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
      .select('id, full_name, position')
      .eq('status', 'active')
      .order('full_name');
    if (memberError) throw new Error(memberError.message);

    const { data: guests, error: guestError } = await supabase
      .from('guest_players')
      .select('id, full_name, position, is_regular')
      .eq('is_active', true)
      .order('full_name');
    if (guestError) throw new Error(guestError.message);

    // Listede mevki de yazar: kaleci mi forvet mi eklediğini seçerken görürsün
    const withPosition = (name: string, position: Position | null, suffix = '') =>
      `${name}${position ? ` — ${POSITION_LABELS[position]}` : ' — mevki yok'}${suffix}`;

    addable = [
      ...(members ?? [])
        .filter((m) => !listedIds.has(m.id as string))
        .map((m) => ({
          value: `m:${m.id}`,
          label: withPosition(
            (m.full_name as string) || 'İsimsiz oyuncu',
            m.position as Position | null,
          ),
        })),
      ...(guests ?? [])
        .filter((g) => !listedIds.has(g.id as string))
        .map((g) => ({
          value: `g:${g.id}`,
          label: withPosition(
            g.full_name as string,
            g.position as Position | null,
            g.is_regular ? '' : ' (aday)',
          ),
        })),
    ];
  }

  return (
    <AppShell
      profile={profile}
      title={formatKickoff(match.kickoffAt)}
      subtitle={
        <>
          {match.venue || 'Saha belirtilmedi'} · Kişi başı{' '}
          {match.feePerPlayer.toLocaleString('tr-TR')} ₺
          {match.sponsorName && (
            <span className="ml-2 badge badge-vip">
              Haftanın sponsoru: {match.sponsorName}
            </span>
          )}
        </>
      }
      action={
        <span className={MATCH_STATUS_BADGES[shownStatus]}>
          {MATCH_STATUS_LABELS[shownStatus]}
        </span>
      }
    >
      <LiveRefresh matchId={matchId} />

      {match.blackScore !== null && match.whiteScore !== null && (
        <div className="card card-pad flex items-center justify-center gap-4 text-center">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-ink-300">{match.blackTeamName}</div>
            <div className="text-3xl font-bold text-frost-100">{match.blackScore}</div>
          </div>
          <span className="text-ink-300">-</span>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-ink-300">{match.whiteTeamName}</div>
            <div className="text-3xl font-bold text-frost-100">{match.whiteScore}</div>
          </div>
        </div>
      )}

      {isBeforePollOpens && (
        <div className="card card-pad flex flex-col gap-1">
          <p className="text-sm font-semibold text-frost-100">Anket henüz açılmadı</p>
          <p className="text-sm text-ink-300">
            Girişler <strong>{formatKickoff(match.pollOpenedAt)}</strong> itibarıyla açılacak.
            O ana kadar kimse listeye giremez.
          </p>
        </div>
      )}

      {isCancelled && (
        <div className="card card-pad flex flex-col gap-1 border-red-400/40">
          <p className="text-sm font-semibold text-frost-100">Bu hafta iptal edildi</p>
          <p className="text-sm text-ink-300">
            {match.cancellationReason || 'Maç oynanmayacak.'}
          </p>
        </div>
      )}

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

          <ToastForm
            action={adminAddParticipant.bind(null, matchId)}
            className="card card-pad flex flex-col gap-3"
          >
            <div className="field">
              <span className="label">Listeye kişi ekle</span>

              {addable.length === 0 ? (
                <p className="text-sm text-ink-300">Eklenecek kimse kalmadı.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-xl border border-[color:var(--line)]">
                  <ul className="divide-line">
                    {addable.map((o) => (
                      <li key={o.value}>
                        <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-ink-100 hover:bg-[color:var(--surface)]">
                          <input
                            type="checkbox"
                            name="participant"
                            value={o.value}
                            className="h-4 w-4 accent-[var(--color-azure-400)]"
                          />
                          {o.label}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="hint">
                Üyeler ve daha önce tanımlanmış oyuncular. Birden fazlasını işaretleyip tek
                seferde ekleyebilirsin; eklenenler sıranın en sonuna, işaretleme sırasına göre
                yazılır.
              </p>
            </div>
            <button className="btn btn-ghost btn-sm self-start" disabled={addable.length === 0}>
              Seçilenleri ekle
            </button>
          </ToastForm>

          <ToastForm
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
                {POSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <button className="btn btn-ghost btn-sm self-start">Tanımla ve ekle</button>
          </ToastForm>

          <Link href={`/poll/${matchId}/squad`} className="btn btn-primary btn-block">
            Kadroyu kesinleştir
          </Link>
        </section>
      )}

      {isPollOpen && (
        <div className="sticky bottom-3 flex flex-col gap-2">
          <ToastForm
            action={async () => {
              'use server';
              // Karar render aninda yakalanan isListed'e gore degil,
              // togglePollEntry'nin o an veritabanindan okudugu duruma gore
              // verilir; buton metni yalnizca gorsel amacli render anini yansitir.
              return togglePollEntry(matchId);
            }}
          >
            <button type="submit" className={`btn btn-block ${isListed ? 'btn-danger' : 'btn-go'}`}>
              {isListed ? 'Anketten çık' : 'Ankete gir'}
            </button>
          </ToastForm>

          <p className="card card-pad text-center text-xs leading-relaxed text-ink-300">
            {isFreeWindowOpen ? (
              <>
                <span className="text-frost-100">{formatShort(freeUntil.toISOString())}</span>{' '}
                tarihine kadar cezasız çıkabilirsin. Sonrasında çıkarsan sonraki ankette giriş
                saatine {match.lateWithdrawalPenaltySeconds} saniye eklenir.
              </>
            ) : (
              <>
                Serbest çıkış süresi doldu. Şimdi çıkarsan sonraki ankette giriş saatine{' '}
                <span className="text-frost-100">{match.lateWithdrawalPenaltySeconds} saniye</span>{' '}
                ceza eklenir.
              </>
            )}
          </p>
        </div>
      )}

      {isClosedPoll && (
        <div className="card card-pad text-sm text-ink-300">
          Bu maçın anketi kapandı, liste kesinleşti.
        </div>
      )}

      {/* Kadro belli olduktan sonra herkes kendi takim dagilimini onerebilir */}
      {match.status === 'squad_locked' && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Kadro önerileri</h2>
          <Link href={`/poll/${matchId}/proposals`} className="btn btn-go btn-block">
            Kadro önerileri
          </Link>
          <p className="hint">
            Sence kim hangi takımda olmalı? Öneri yapma yetkisi olanlar kendi dizilişini
            kaydeder, herkes görür; yönetici beğendiğini tek tıkla uygular.
          </p>
        </section>
      )}

      {(match.status === 'played' || match.status === 'completed') && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Maç sonrası</h2>
          <Link href={`/poll/${matchId}/ratings`} className="btn btn-primary btn-block">
            Oyla ve yorum yaz
          </Link>
          <p className="hint">
            Kadrodaki herkes birbirine yıldız verir ve maç için yorum yazar. Verdiğin oyu
            yalnızca sen ve yönetici görür.
          </p>
        </section>
      )}

      {isAdmin && isClosedPoll && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Yönetim</h2>
          <Link href={`/poll/${matchId}/result`} className="btn btn-primary btn-block">
            Takımlar ve skor
          </Link>
          <Link href={`/poll/${matchId}/payments`} className="btn btn-ghost btn-block">
            Ödemeler
          </Link>
          <p className="hint">
            Oyuncuları iki takıma ayır, maç bitince skoru gir. <strong>Skoru kaydettiğin an
            maç &quot;Oynandı&quot; olur</strong> ve puan durumuna işler. Herkes parasını
            ödeyince &quot;Ödemeler&quot; sayfasından maçı kapatırsın.
          </p>
        </section>
      )}

      {isAdmin && match.status === 'squad_locked' && (
        <ToastForm action={markMatchPlayed.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
          <p className="text-sm text-ink-300">
            Maç oynandıysa işaretle: durumu &quot;Oynandı&quot; olur ve oyuncular birbirini
            oylamaya başlar. Skoru sonra da girebilirsin.
          </p>
          <button className="btn btn-go btn-sm self-start">Maç oynandı</button>
        </ToastForm>
      )}

      {isAdmin && match.status === 'squad_locked' && (
        <ToastForm action={unlockSquad.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
          <p className="text-sm text-ink-300">
            Kadroyu geri alırsan anket yeniden açılır; listeye ekleme çıkarma yapıp tekrar
            kesinleştirebilirsin.
          </p>
          <button className="btn btn-danger btn-sm self-start">Kadroyu geri al</button>
        </ToastForm>
      )}

      {isAdmin && (isPollOpen || match.status === 'squad_locked') && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Bu haftanın bilgileri</h2>

          <ToastForm
            action={updateMatchDetails.bind(null, matchId)}
            className="card card-pad flex flex-col gap-4"
          >
            <div className="field">
              <label className="label" htmlFor="venue">
                Saha
              </label>
              <input
                id="venue"
                name="venue"
                type="text"
                defaultValue={match.venue}
                placeholder="Saha adı"
                className="input"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="label" htmlFor="feePerPlayer">
                  Kişi başı ücret (₺)
                </label>
                <input
                  id="feePerPlayer"
                  name="feePerPlayer"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={match.feePerPlayer}
                  className="input"
                />
                <p className="hint">Ödemeler sayfası bu tutarı kullanır.</p>
              </div>

              <div className="field">
                <label className="label" htmlFor="squadSize">
                  Kadro mevcudu
                </label>
                <input
                  id="squadSize"
                  name="squadSize"
                  type="number"
                  min={2}
                  max={40}
                  defaultValue={match.squadSize}
                  className="input"
                />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="sponsorName">
                Haftanın sponsoru
              </label>
              <input
                id="sponsorName"
                name="sponsorName"
                type="text"
                maxLength={60}
                defaultValue={match.sponsorName}
                placeholder="Sahayı ödeyen kişi ya da işyeri (boş bırakılabilir)"
                className="input"
              />
              <p className="hint">Yazarsan maç listesinde ve bu sayfada görünür.</p>
            </div>

            <button className="btn btn-ghost btn-sm self-start">Kaydet</button>
          </ToastForm>
        </section>
      )}

      {isAdmin && (isPollOpen || match.status === 'squad_locked') && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Haftayı iptal et</h2>
          <ToastForm
          action={cancelMatch.bind(null, matchId)}
          className="card card-pad flex flex-col gap-3"
        >
          <div className="field">
            <label className="label" htmlFor="reason">
              Haftayı iptal et
            </label>
            <input
              id="reason"
              name="reason"
              type="text"
              placeholder="Sebep (örn. bayram tatili)"
              className="input"
            />
            <p className="hint">
              Maç listede kalır, herkes iptali görür. Takvim bu hafta için yeni maç
              üretmez. İstersen sonra geri alabilirsin.
            </p>
          </div>
          <button className="btn btn-danger btn-sm self-start">Haftayı iptal et</button>
          </ToastForm>
        </section>
      )}

      {isAdmin && match.status !== 'completed' && (
        <ToastForm action={deleteMatch.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
          <p className="text-sm text-ink-300">
            Bu maçı tamamen silersin: anket girişleri, kadro ve ödemeler, takım dağılımı,
            oylar, yorumlar ve bu haftaya yazılmış kasa hareketleri de birlikte gider. Geri
            alınamaz — yalnızca yanlışlıkla açılmış maç için. Haftayı oynamıyorsanız silmek
            yerine <strong>iptal et</strong>: kayıt listede kalır, kasaya girmez.
          </p>
          <button className="btn btn-danger btn-sm self-start">Maçı sil</button>
        </ToastForm>
      )}

      {isAdmin && isCancelled && (
        <ToastForm action={restoreMatch.bind(null, matchId)} className="card card-pad flex flex-col gap-2">
          <p className="text-sm text-ink-300">
            İptali geri alırsan hafta bırakıldığı duruma döner; liste ve girişler
            olduğu gibi kalmıştır.
          </p>
          <button className="btn btn-ghost btn-sm self-start">İptali geri al</button>
        </ToastForm>
      )}
    </AppShell>
  );
}
