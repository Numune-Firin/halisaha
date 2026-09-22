import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import {
  createServerSupabase,
  getCurrentProfile,
  isSystemOwner,
} from '@/lib/supabase/server';
import { getSquad } from '@/lib/db/squad';
import { finalizeDueMvps } from '@/lib/db/ratings';
import { formatKickoff, formatShort, type MatchStatus } from '@/lib/ui/format';
import {
  addComment,
  deleteComment,
  setMatchMvp,
  deleteRating,
  editComment,
  ratePlayer,
  setRatingStars,
  setVotingDeadline,
} from './actions';
import { StarRating } from './StarRating';
import { auditVotes, VOTE_FLAG_LABELS } from '@/lib/poll/vote-audit';
import { ToastForm } from '@/components/ToastForm';

type RatingRow = {
  id: string;
  rater_id: string;
  weight?: number;
  ratee_player_id: string | null;
  ratee_guest_id: string | null;
  stars: number;
  profiles: { full_name: string } | null;
};

/** datetime-local alaninin bekledigi bicim, Turkiye saatiyle: 2026-09-17T14:30 */
function toLocalInput(iso: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(iso))
    .replace(' ', 'T');
}

/** Oy verilen kisinin anahtari: uye ise profiles.id, aday ise guest_players.id. */
function rateeKey(row: { ratee_player_id: string | null; ratee_guest_id: string | null }) {
  return (row.ratee_player_id ?? row.ratee_guest_id) as string;
}

export default async function RatingsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const isAdmin = profile.role === 'admin';
  // Sistem sahibi: oy agirligini belirleyebilen tek kisi
  const isOwner = isSystemOwner(profile);

  // Suresi dolmus maclarin MVP'si burada belirlenir; ayri bir zamanlanmis
  // gorev yok, sayfayi acan kisi tetikler.
  await finalizeDueMvps();

  const supabase = await createServerSupabase();

  const { data: match, error } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, voting_closes_at, mvp_player_id, mvp_guest_id')
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!match) notFound();

  const status = match.status as MatchStatus;
  const isPlayed = status === 'played' || status === 'completed';
  const closesAt = (match.voting_closes_at as string | null) ?? null;
  const isVotingOpen =
    isPlayed && (!closesAt || new Date(closesAt).getTime() > Date.now());
  const mvpId =
    (match.mvp_player_id as string | null) ?? (match.mvp_guest_id as string | null);
  const squad = await getSquad(matchId);
  const mvp = squad.find((m) => (m.playerId ?? m.guestId) === mvpId) ?? null;

  // RLS kararini veriyor: oyuncu yalnizca kendi verdigi oylari, yonetici
  // hepsini okur. Burada ayrica filtre koymaya gerek yok.
  const { data: ratingRows, error: ratingError } = await supabase
    .from('match_ratings')
    .select('id, rater_id, ratee_player_id, ratee_guest_id, stars, weight, profiles!match_ratings_rater_id_fkey(full_name)')
    .eq('match_id', matchId);
  if (ratingError) throw new Error(ratingError.message);

  const ratings = (ratingRows ?? []) as unknown as RatingRow[];
  const myStars = new Map<string, number>();
  const myWeights = new Map<string, number>();
  const byRatee = new Map<string, RatingRow[]>();
  for (const row of ratings) {
    const key = rateeKey(row);
    if (row.rater_id === profile.id) {
      myStars.set(key, row.stars);
      myWeights.set(key, row.weight ?? 1);
    }
    byRatee.set(key, [...(byRatee.get(key) ?? []), row]);
  }

  // Oylama denetimi yalnizca yoneticiye: oy satirlarinin tamamini o gorur
  const auditFlags = isAdmin
    ? auditVotes(
        ratings.map((row) => {
          const ratee = squad.find((m) => (m.playerId ?? m.guestId) === rateeKey(row));
          return {
            raterId: row.rater_id,
            raterName: row.profiles?.full_name || 'İsimsiz oyuncu',
            rateeId: rateeKey(row),
            rateeName: ratee?.fullName || 'İsimsiz oyuncu',
            stars: row.stars,
          };
        }),
      )
    : [];

  const { data: commentRows, error: commentError } = await supabase
    .from('match_comments')
    .select('id, body, created_at, author_id, profiles(full_name)')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });
  if (commentError) throw new Error(commentError.message);

  const comments = commentRows ?? [];
  const isInSquad = squad.some((m) => m.playerId === profile.id);
  // Yonetici kendine de oy verebilir; normal oyuncu veremez.
  // Oy da yorum da yalnizca o macin kadrosunda olanlara acik; yonetici
  // kadroda olmasa da yazabilir. Ayni kural veritabaninda da duruyor.
  const canVote = isVotingOpen && (isAdmin || isInSquad);
  const canComment = canVote;

  return (
    <AppShell
      profile={profile}
      title="Oylama ve yorumlar"
      subtitle={`${formatKickoff(match.kickoff_at as string)} · ${match.venue || 'Saha belirtilmedi'}`}
      action={
        isAdmin ? <span className="badge badge-vip">Oyları görebilirsin</span> : undefined
      }
    >
      {isPlayed && (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="card card-pad">
            <p className="text-xs uppercase tracking-wide text-ink-300">Oylama</p>
            <p className="mt-1 text-base font-semibold text-frost-100">
              {isVotingOpen ? 'Açık' : 'Kapandı'}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              {closesAt
                ? `${formatShort(closesAt)} ${isVotingOpen ? 'tarihine kadar' : 'tarihinde kapandı'}`
                : 'Bitiş tarihi belirlenmedi'}
            </p>
          </div>

          <div className="card card-pad">
            <p className="text-xs uppercase tracking-wide text-ink-300">Maçın yıldızı</p>
            <p className="mt-1 text-base font-semibold text-frost-100">
              {mvp ? mvp.fullName : isVotingOpen ? 'Oylama bitince belli olur' : 'Seçilmedi'}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              {mvp
                ? 'Sonraki ankette VIP olarak listeye yazıldı'
                : 'En yüksek ortalamayı alan oyuncu MVP olur'}
            </p>

            {isAdmin && (
              <ToastForm
                action={setMatchMvp.bind(null, matchId)}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <select
                  name="mvp"
                  key={mvpId ?? 'none'}
                  defaultValue={
                    mvp ? `${mvp.playerId ? 'm' : 'g'}:${mvp.playerId ?? mvp.guestId}` : ''
                  }
                  aria-label="Maçın yıldızı"
                  className="input input-sm w-44"
                >
                  <option value="">Oylamaya göre belirlensin</option>
                  {squad.map((m) => (
                    <option
                      key={m.id}
                      value={`${m.playerId ? 'm' : 'g'}:${m.playerId ?? m.guestId}`}
                    >
                      {m.fullName}
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost btn-sm">Kaydet</button>
              </ToastForm>
            )}
          </div>
        </section>
      )}

      {isAdmin && isPlayed && (
        <ToastForm
          action={setVotingDeadline.bind(null, matchId)}
          className="card card-pad flex flex-wrap items-end gap-3"
        >
          <div className="field min-w-0 flex-1">
            <label className="label" htmlFor="closesAt">
              Oylama ve yorum bitişi
            </label>
            <input
              id="closesAt"
              name="closesAt"
              type="datetime-local"
              required
              defaultValue={closesAt ? toLocalInput(closesAt) : undefined}
              className="input"
            />
            <p className="hint">
              Türkiye saati. Süre dolunca oy ve yorum kapanır, MVP kendiliğinden seçilir.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm">Kaydet</button>
        </ToastForm>
      )}

      {!isPlayed ? (
        <div className="card card-pad flex flex-col items-start gap-3 text-sm text-ink-300">
          <p>
            Oylama, maç &quot;Oynandı&quot; olarak işaretlenince açılır. Yönetici maç sayfasından
            işaretler.
          </p>
          <Link href={`/poll/${matchId}`} className="btn btn-ghost btn-sm">
            Maça dön
          </Link>
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Oyuncular</h2>

          {!canVote && (
            <div className="card card-pad text-sm text-ink-300">
              {!isVotingOpen
                ? 'Oylama süresi doldu. Verilen oylar ve maçın yıldızı yukarıda.'
                : 'Bu maçın kadrosunda değilsin: oy veremez, yorum yazamazsın. Yazılanları okuyabilirsin.'}
            </div>
          )}

          <ul className="card divide-line">
            {squad.map((m) => {
              const key = (m.playerId ?? m.guestId) as string;
              const isSelf = m.playerId === profile.id;
              const given = byRatee.get(key) ?? [];
              const average =
                given.length > 0
                  ? given.reduce((sum, r) => sum + r.stars, 0) / given.length
                  : null;

              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-frost-100">
                      {m.fullName}
                      {isSelf && <span className="ml-2 text-xs text-ink-300">(sen)</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {mvpId && (m.playerId ?? m.guestId) === mvpId && (
                        <span className="badge badge-vip">Maçın yıldızı</span>
                      )}
                      {m.isGuest && !m.isRegular && (
                        <span className="badge badge-muted">Aday</span>
                      )}
                      {isAdmin && average !== null && (
                        <span className="badge badge-vip">
                          Ortalama {average.toFixed(1)} · {given.length} oy
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelf && !isAdmin ? (
                    <span className="text-xs text-ink-500">Kendine oy veremezsin</span>
                  ) : !isAdmin && myStars.has(key) ? (
                    // Oy verildi: kesin. Degistirmek icin yoneticinin silmesi gerekir.
                    <span className="flex items-center gap-2">
                      <span className="text-amber-400" title="Verdiğin oy">
                        {'★'.repeat(myStars.get(key) as number)}
                      </span>
                      <span className="text-xs text-ink-500">Oyun kayıtlı</span>
                    </span>
                  ) : canVote ? (
                    <StarRating
                      action={ratePlayer.bind(null, matchId, {
                        playerId: m.playerId,
                        guestId: m.guestId,
                      })}
                      value={myStars.get(key) ?? null}
                      weight={myWeights.get(key) ?? 1}
                      canWeigh={isOwner}
                      label={m.fullName}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p className="hint">
            Verdiğin oyları yalnızca sen ve yönetici görür. <strong>Oy bir kez verilir</strong>,
            sonradan değiştirilemez. Yanlış verdiysen yöneticiye söyle: oyunu silerse yeniden
            verebilirsin.
            {isAdmin && (
              <>
                {' '}
                Yönetici olarak kadroda olmasan da oy verebilir, kendi satırını da
                puanlayabilirsin; kendine verdiğin oy aşağıda ayrıca görünür.
              </>
            )}
          </p>
        </section>
      )}

      {isAdmin && isPlayed && auditFlags.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">
            Oylamada dikkat çeken{' '}
            <span className="badge badge-muted">{auditFlags.length}</span>
          </h2>

          <div className="card card-pad border-amber-500/40 bg-amber-500/5">
            <p className="hint">
              Aşağıdakiler <strong>suçlama değil</strong>, bakmaya değer işaretler: oylar
              beklenenden farklı dağılmış. Oyuncular kendine oy veremez, yöneticiler
              verebilir; ayrıca iki kişi anlaşıp birbirine yüksek verebilir. Kararı sen
              verirsin — oyu silersen o kişi yeniden oy verebilir.
            </p>

            <ul className="mt-3 flex flex-col gap-2">
              {auditFlags.map((flag, index) => (
                <li
                  key={`${flag.raterId}-${flag.kind}-${index}`}
                  className="border-t border-white/10 pt-2 first:border-t-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-frost-100">
                      {flag.raterName}
                    </span>
                    <span className="badge badge-vip">{VOTE_FLAG_LABELS[flag.kind]}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-300">{flag.message}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {isAdmin && isPlayed && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">
            Kim kime ne verdi <span className="badge badge-muted">{ratings.length}</span>
          </h2>

          {ratings.length === 0 ? (
            <div className="card card-pad text-sm text-ink-300">Henüz oy verilmedi.</div>
          ) : (
            <ul className="flex flex-col gap-3">
              {squad
                .filter((m) => (byRatee.get((m.playerId ?? m.guestId) as string) ?? []).length > 0)
                .map((m) => {
                  const key = (m.playerId ?? m.guestId) as string;
                  const given = byRatee.get(key) ?? [];
                  return (
                    <li key={m.id} className="card card-pad">
                      <h3 className="font-semibold text-frost-100">{m.fullName}</h3>
                      <ul className="mt-2 flex flex-col gap-1">
                        {given.map((r) => (
                          <li
                            key={r.id}
                            className="flex flex-wrap items-center gap-3 text-sm"
                          >
                            <span className="min-w-0 flex-1 truncate text-ink-300">
                              {r.profiles?.full_name || 'İsimsiz oyuncu'}
                            </span>

                            <StarRating
                              action={setRatingStars.bind(null, matchId, r.id)}
                              value={r.stars}
                              label={`${r.profiles?.full_name ?? 'Oyuncu'} → ${m.fullName}`}
                            />

                            <ToastForm action={deleteRating.bind(null, matchId, r.id)}>
                              <button
                                className="text-xs text-ink-500 underline"
                                title="Oyu siler; o oyuncu yeniden oy verebilir"
                              >
                                Sil
                              </button>
                            </ToastForm>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Yorumlar <span className="badge badge-muted">{comments.length}</span>
        </h2>

        {isPlayed && !canComment && (
          <div className="card card-pad text-sm text-ink-300">
            {!isVotingOpen
              ? 'Yorumlar kapandı; eski yorumlar aşağıda duruyor.'
              : 'Yorum yazmak için bu maçın kadrosunda olman gerekiyor.'}
          </div>
        )}

        {canComment && (
        <ToastForm action={addComment.bind(null, matchId)} className="card card-pad flex flex-col gap-3">
          <div className="field">
            <label className="label" htmlFor="body">
              Maç hakkında yaz
            </label>
            <textarea
              id="body"
              name="body"
              required
              rows={3}
              maxLength={1000}
              placeholder="Maçı nasıl buldun?"
              className="input"
            />
            <p className="hint">Yorumu gruptaki herkes görür, adın yazar.</p>
          </div>
          <button className="btn btn-primary btn-sm self-start">Gönder</button>
        </ToastForm>
        )}

        {comments.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">Henüz yorum yok.</div>
        ) : (
          <ul className="card divide-line">
            {comments.map((c) => {
              const author = c.profiles as unknown as { full_name: string } | null;
              // Yorumu yalnizca yonetici siler ya da duzeltir; yazan kendi
              // yorumunu kaldiramaz.
              return (
                <li key={c.id as string} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-frost-100">
                      {author?.full_name || 'İsimsiz oyuncu'}
                    </span>
                    <span className="shrink-0 text-xs text-ink-500">
                      {formatShort(c.created_at as string)}
                    </span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-ink-300">{c.body as string}</p>
                  {isAdmin && (
                    <div className="flex flex-wrap items-center gap-3">
                      <details>
                        <summary className="cursor-pointer text-xs text-azure-400">
                          Düzenle
                        </summary>
                        <ToastForm
                          action={editComment.bind(null, matchId, c.id as string)}
                          className="mt-2 flex flex-col gap-2"
                        >
                          <textarea
                            name="body"
                            rows={3}
                            maxLength={1000}
                            defaultValue={c.body as string}
                            aria-label="Yorum metni"
                            className="input"
                          />
                          <button className="btn btn-ghost btn-sm self-start">Kaydet</button>
                        </ToastForm>
                      </details>

                      <ToastForm action={deleteComment.bind(null, matchId, c.id as string)}>
                        <button
                          className="text-xs text-ink-500 underline"
                          title="Siler; yazan kişi yeni yorum yazabilir"
                        >
                          Sil
                        </button>
                      </ToastForm>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
