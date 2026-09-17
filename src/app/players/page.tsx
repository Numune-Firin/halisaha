import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { POSITION_LABELS, POSITION_OPTIONS } from '@/lib/ui/position';
import type { Position } from '@/lib/poll/types';
import { PositionSelect } from './PositionSelect';
import { getRatingSummary } from '@/lib/db/ratings';
import {
  createPlayer,
  setGuestActive,
  setGuestPosition,
  setGuestRegular,
  setMemberRole,
  setOverrideRating,
  setPlayerPosition,
  setPlayerTier,
} from './actions';
import { RatingCell } from './RatingCell';
import { TierSelect } from './TierSelect';
import { TIER_BADGES, TIER_LABELS, type PlayerTier } from '@/lib/ui/tier';

export default async function PlayersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const isAdmin = profile.role === 'admin';
  const supabase = await createServerSupabase();

  const { data: members, error: memberError } = await supabase
    .from('profiles')
    .select('id, full_name, position, role, status, override_rating, tier, email')
    .in('status', isAdmin ? ['active', 'inactive'] : ['active'])
    .order('full_name');
  if (memberError) throw new Error(memberError.message);

  const { data: guests, error: guestError } = await supabase
    .from('guest_players')
    .select('id, full_name, position, is_active, is_regular, override_rating, tier')
    .order('full_name');
  if (guestError) throw new Error(guestError.message);

  // Genel yildiz: butun maclardan gelen ortalama. Yonetici bu degeri ezerse
  // (override_rating) ortalama yerine o gosterilir.
  const ratingSummary = await getRatingSummary();

  const { data: settings } = await supabase
    .from('settings')
    .select('guest_promotion_matches')
    .maybeSingle();
  const promotionThreshold = (settings?.guest_promotion_matches as number | null) ?? 3;

  // Oynanmis maclardaki kadro satirlari sayilir; takim atanmasi sart degil,
  // maca gelmis olmak yeter. Iki adimli sorgu standings ile ayni yolu izler.
  const { data: playedMatches, error: playedError } = await supabase
    .from('matches')
    .select('id')
    .in('status', ['played', 'completed']);
  if (playedError) throw new Error(playedError.message);

  const playedIds = (playedMatches ?? []).map((m) => m.id as string);
  const guestMatchCount = new Map<string, number>();
  if (playedIds.length > 0) {
    const { data: squadRows, error: squadError } = await supabase
      .from('match_squad')
      .select('guest_id')
      .in('match_id', playedIds)
      .not('guest_id', 'is', null);
    if (squadError) throw new Error(squadError.message);

    for (const row of squadRows ?? []) {
      const guestId = row.guest_id as string;
      guestMatchCount.set(guestId, (guestMatchCount.get(guestId) ?? 0) + 1);
    }
  }

  // Adayliktan cikmis olanlar uste alinir; ikisi de ada gore sirali kalir.
  const guestRows = (guests ?? [])
    .filter((g) => isAdmin || g.is_active)
    .sort((a, b) => Number(b.is_regular) - Number(a.is_regular));

  return (
    <AppShell
      profile={profile}
      title="Oyuncular"
      subtitle={
        isAdmin
          ? 'Gruptaki herkes ve üye olmayan oyuncular. Mevkileri buradan değiştirebilirsin.'
          : 'Gruptaki herkes ve mevkileri.'
      }
    >
      {isAdmin && (
        <p className="hint">
          <strong>VIP (sabit)</strong> seçilen oyuncu her hafta anket açılır açılmaz listeye
          kendiliğinden yazılır, girmesine gerek kalmaz. <strong>Öncelikli</strong> girer ama
          normal girenlerin hep önünde sıralanır.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Üyeler <span className="badge badge-muted">{(members ?? []).length}</span>
        </h2>

        <ul className="card divide-line">
          {(members ?? []).map((m) => {
            const id = m.id as string;
            const position = m.position as Position | null;
            // Mevkiyi yalnizca yonetici degistirir; oyuncu kendi satirinda da
            // yalnizca okur. Kurulun tek elden yurumesi icin boyle istendi.
            const canEdit = isAdmin;
            const name = (m.full_name as string) || 'İsimsiz oyuncu';

            return (
              <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-frost-100">
                    {name}
                    {id === profile.id && <span className="ml-2 text-xs text-ink-300">(sen)</span>}
                  </div>
                  {isAdmin && (
                    <div className="truncate text-xs text-ink-500">
                      {(m.email as string | null) || 'E-posta yok'}
                    </div>
                  )}
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {m.role === 'admin' && <span className="badge badge-vip">Yönetici</span>}
                    {m.status === 'inactive' && <span className="badge badge-muted">Pasif</span>}
                    {TIER_BADGES[m.tier as PlayerTier] && (
                      <span className={TIER_BADGES[m.tier as PlayerTier] as string}>
                        {TIER_LABELS[m.tier as PlayerTier]}
                      </span>
                    )}
                    {isAdmin && m.status === 'active' && (
                      <form action={setMemberRole.bind(null, id, m.role !== 'admin')}>
                        <button className="text-xs text-ink-300 underline">
                          {m.role === 'admin' ? 'Yöneticilikten çıkar' : 'Yönetici yap'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <TierSelect
                    action={setPlayerTier.bind(null, 'member', id)}
                    value={m.tier as string}
                    label={name}
                  />
                )}

                <RatingCell
                  action={setOverrideRating.bind(null, 'member', id)}
                  override={m.override_rating === null ? null : Number(m.override_rating)}
                  summary={ratingSummary.get(id) ?? null}
                  canEdit={isAdmin}
                  label={name}
                />

                {canEdit ? (
                  <PositionSelect
                    action={setPlayerPosition.bind(null, id)}
                    value={position}
                    label={name}
                  />
                ) : (
                  <span className="badge badge-muted">
                    {position ? POSITION_LABELS[position] : 'Mevki yok'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {isAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Elle oyuncu ekle</h2>

          <form action={createPlayer} className="card card-pad flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="label" htmlFor="fullName">
                  Ad soyad
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  placeholder="Örn. Kiralık kaleci Ahmet"
                  className="input"
                />
                <p className="hint">
                  Google hesabı olmayan kişiler için: bir kez tanımlanır, her hafta listeden
                  seçilir.
                </p>
              </div>

              <div className="field">
                <label className="label" htmlFor="newPosition">
                  Mevki
                </label>
                <select id="newPosition" name="position" defaultValue="" className="input">
                  <option value="">Belirtilmedi</option>
                  {POSITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-ink-300">
              <input
                type="checkbox"
                name="isRegular"
                defaultChecked
                className="mt-0.5 h-4 w-4 accent-[var(--color-azure-400)]"
              />
              <span>
                Asıl oyuncu olarak ekle — &quot;Aday&quot; rozeti hiç çıkmaz, 3 maç kuralı bu
                kişiye işlemez.
              </span>
            </label>

            <button className="btn btn-primary btn-block">Oyuncuyu ekle</button>
          </form>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Üye olmayan oyuncular{' '}
          <span className="badge badge-muted">{guestRows.length}</span>
        </h2>

        {guestRows.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Henüz aday oyuncu tanımlanmadı. Anket sayfasından ekleyebilirsin.
          </div>
        ) : (
          <ul className="card divide-line">
            {guestRows.map((g) => {
              const id = g.id as string;
              const position = g.position as Position | null;
              const name = g.full_name as string;
              const isRegular = g.is_regular as boolean;
              const playedCount = guestMatchCount.get(id) ?? 0;

              return (
                <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-frost-100">{name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {isRegular ? (
                        <span className="badge">Asıl oyuncu</span>
                      ) : (
                        <span className="badge badge-muted">
                          Aday · {playedCount}/{promotionThreshold} maç
                        </span>
                      )}
                      {TIER_BADGES[g.tier as PlayerTier] && (
                        <span className={TIER_BADGES[g.tier as PlayerTier] as string}>
                          {TIER_LABELS[g.tier as PlayerTier]}
                        </span>
                      )}
                      {!g.is_active && <span className="badge badge-muted">Listeden çıkarıldı</span>}
                      {isAdmin && (
                        <form action={setGuestRegular.bind(null, id, !isRegular)}>
                          <button className="text-xs text-ink-300 underline">
                            {isRegular ? 'Adaylığa al' : 'Asıl yap'}
                          </button>
                        </form>
                      )}
                      {isAdmin && (
                        <form action={setGuestActive.bind(null, id, !g.is_active)}>
                          <button className="text-xs text-ink-300 underline">
                            {g.is_active ? 'Listeden çıkar' : 'Listeye geri al'}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {isAdmin && (
                    <TierSelect
                      action={setPlayerTier.bind(null, 'guest', id)}
                      value={g.tier as string}
                      label={name}
                    />
                  )}

                  <RatingCell
                    action={setOverrideRating.bind(null, 'guest', id)}
                    override={g.override_rating === null ? null : Number(g.override_rating)}
                    summary={ratingSummary.get(id) ?? null}
                    canEdit={isAdmin}
                    label={name}
                  />

                  {isAdmin ? (
                    <PositionSelect
                      action={setGuestPosition.bind(null, id)}
                      value={position}
                      label={name}
                    />
                  ) : (
                    <span className="badge badge-muted">
                      {position ? POSITION_LABELS[position] : 'Mevki yok'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="hint">
          Bu kişilerin Google hesabıyla girişi yoktur; ankete yalnızca yönetici ekler ve
          listeden çıkarılan biri yeni maçlarda seçenek olarak görünmez.{' '}
          {promotionThreshold}. maçını oynayan aday kendiliğinden asıl oyuncu olur.
          {isAdmin
            ? ' "Asıl yap" ya da "Adaylığa al" dersen o kişi için otomatik kural devreden çıkar, karar sende kalır.'
            : ''}
        </p>
      </section>
    </AppShell>
  );
}
