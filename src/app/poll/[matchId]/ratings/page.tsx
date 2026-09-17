import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { getSquad } from '@/lib/db/squad';
import { finalizeDueMvps } from '@/lib/db/ratings';
import { formatKickoff, formatShort, type MatchStatus } from '@/lib/ui/format';
import { addComment, deleteComment, ratePlayer, setVotingDeadline } from './actions';
import { StarRating } from './StarRating';

type RatingRow = {
  rater_id: string;
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
    .select('rater_id, ratee_player_id, ratee_guest_id, stars, profiles!match_ratings_rater_id_fkey(full_name)')
    .eq('match_id', matchId);
  if (ratingError) throw new Error(ratingError.message);

  const ratings = (ratingRows ?? []) as unknown as RatingRow[];
  const myStars = new Map<string, number>();
  const byRatee = new Map<string, RatingRow[]>();
  for (const row of ratings) {
    const key = rateeKey(row);
    if (row.rater_id === profile.id) myStars.set(key, row.stars);
    byRatee.set(key, [...(byRatee.get(key) ?? []), row]);
  }

  const { data: commentRows, error: commentError } = await supabase
    .from('match_comments')
    .select('id, body, created_at, author_id, profiles(full_name)')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });
  if (commentError) throw new Error(commentError.message);

  const comments = commentRows ?? [];
  const isInSquad = squad.some((m) => m.playerId === profile.id);
  // Yonetici kendine de oy verebilir; normal oyuncu veremez.
  const canVote = isVotingOpen && (isAdmin || isInSquad);

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
          </div>
        </section>
      )}

      {isAdmin && isPlayed && (
        <form
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
        </form>
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
                : 'Bu maçın kadrosunda olmadığın için oy veremezsin; yorumları okuyabilir ve yorum yazabilirsin.'}
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
                  ) : canVote ? (
                    <StarRating
                      action={ratePlayer.bind(null, matchId, {
                        playerId: m.playerId,
                        guestId: m.guestId,
                      })}
                      value={myStars.get(key) ?? null}
                      label={m.fullName}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p className="hint">
            Verdiğin oyları yalnızca sen ve yönetici görür. İstediğin zaman değiştirebilirsin,
            son verdiğin yıldız geçerli olur.
          </p>
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
                            key={`${r.rater_id}-${key}`}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="truncate text-ink-300">
                              {r.profiles?.full_name || 'İsimsiz oyuncu'}
                            </span>
                            <span className="text-amber-400">{'★'.repeat(r.stars)}</span>
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

        {!isVotingOpen && isPlayed && (
          <div className="card card-pad text-sm text-ink-300">
            Yorumlar kapandı; eski yorumlar aşağıda duruyor.
          </div>
        )}

        {isVotingOpen && (
        <form action={addComment.bind(null, matchId)} className="card card-pad flex flex-col gap-3">
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
        </form>
        )}

        {comments.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">Henüz yorum yok.</div>
        ) : (
          <ul className="card divide-line">
            {comments.map((c) => {
              const author = c.profiles as unknown as { full_name: string } | null;
              const canDelete = isAdmin || c.author_id === profile.id;
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
                  {canDelete && (
                    <form action={deleteComment.bind(null, matchId, c.id as string)}>
                      <button className="text-xs text-ink-500 underline">Sil</button>
                    </form>
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
