import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { getSquad } from '@/lib/db/squad';
import { formatKickoff, formatShort } from '@/lib/ui/format';
import { PitchLineup } from '@/components/PitchLineup';
import { PitchView } from '@/components/PitchView';
import { spotsFromSlots } from '@/lib/poll/lineup-data';
import { ToastForm } from '@/components/ToastForm';
import { applyProposal, deleteProposal, saveProposal } from './actions';
import type { Team } from '@/lib/standings/table';

type SlotRow = {
  proposal_id: string;
  squad_row_id: string;
  team: Team;
  pos_x: number | null;
  pos_y: number | null;
};

/**
 * Kadro onerileri.
 *
 * Takimi yonetici kurar ama fikir herkesin: bu sayfada her oyuncu kendi
 * dagilimini kaydeder, herkes birbirininkini gorur, yonetici begendigini tek
 * tiklamayla uygular.
 *
 * Yildizlar burada da yalnizca yoneticiye gorunur; oyuncular birbirini
 * puanlara bakarak ayirmasin diye.
 */
export default async function ProposalsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const isAdmin = profile.role === 'admin';

  // Oneri yapmak yetki ister: yonetici her zaman, oyuncu yalnizca yetkiliyse.
  // Yetkisi olmayan da sayfayi acar, onerileri okur.
  const supabaseForRight = await createServerSupabase();
  const { data: rightRow } = await supabaseForRight
    .from('profiles')
    .select('can_propose_squad')
    .eq('id', profile.id)
    .maybeSingle();
  const mayPropose = isAdmin || rightRow?.can_propose_squad === true;

  const supabase = await createServerSupabase();
  const { data: match, error } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, black_team_name, white_team_name')
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!match) notFound();

  const squad = await getSquad(matchId);
  const blackName = (match.black_team_name as string) || 'Siyah';
  const whiteName = (match.white_team_name as string) || 'Beyaz';

  const status = match.status as string;
  const kickoff = new Date(match.kickoff_at as string);
  const isPollOpen = status === 'poll_open';
  const isCancelled = status === 'cancelled';
  // Oneri penceresi: kadro kesinlesince acilir, mac saatinde kapanir
  const isWindowOpen = status === 'squad_locked' && kickoff.getTime() > Date.now();
  const canPropose = isWindowOpen && mayPropose;

  const { data: proposalRows, error: proposalError } = await supabase
    .from('squad_proposals')
    .select('id, author_id, updated_at, profiles(full_name)')
    .eq('match_id', matchId)
    .order('updated_at', { ascending: false });
  if (proposalError) throw new Error(proposalError.message);

  const proposals = proposalRows ?? [];

  const { data: slotRows } = await supabase
    .from('squad_proposal_slots')
    .select('proposal_id, squad_row_id, team, pos_x, pos_y')
    .in(
      'proposal_id',
      proposals.length > 0
        ? proposals.map((p) => p.id as string)
        : ['00000000-0000-0000-0000-000000000000'],
    );
  const slots = (slotRows ?? []) as unknown as SlotRow[];

  // Her onerinin kendi saha dizilişi; konumsuz eski oneriler mevkiye gore dizilir
  const byProposal = new Map<string, SlotRow[]>();
  for (const slot of slots) {
    byProposal.set(slot.proposal_id, [...(byProposal.get(slot.proposal_id) ?? []), slot]);
  }

  const mine = proposals.find((p) => p.author_id === profile.id) ?? null;
  const mySpots = mine ? spotsFromSlots(squad, byProposal.get(mine.id as string) ?? []) : undefined;

  return (
    <AppShell
      profile={profile}
      title="Kadro önerileri"
      subtitle={`${formatKickoff(match.kickoff_at as string)} · ${match.venue || 'Saha belirtilmedi'}`}
      action={
        <Link href={`/poll/${matchId}`} className="btn btn-ghost btn-sm">
          Maça dön
        </Link>
      }
    >
      <div className="card card-pad text-sm leading-relaxed text-ink-300">
        {mayPropose ? (
          <>
            Takımı yönetici kurar ama fikir herkesin. Kendi dağılımını kaydet, herkes görsün.
            İstediğin zaman değiştirebilirsin; son kaydettiğin geçerli olur.
          </>
        ) : (
          <>
            Öneriler herkese açık, ama <strong>öneri yapma yetkisi</strong> yöneticinin verdiği
            kişilerde. İstersen yöneticiden isteyebilirsin; o zamana kadar aşağıdaki önerileri
            okuyabilirsin.
          </>
        )}
      </div>

      {isPollOpen && (
        <div className="card card-pad text-sm text-ink-300">
          Anket hâlâ açık. Kim oynayacağı belli olmadan takım kurulmaz — kadro kesinleştiğinde
          burası açılır.
        </div>
      )}

      {isCancelled && (
        <div className="card card-pad text-sm text-ink-300">Bu hafta iptal edildi.</div>
      )}

      {!isPollOpen && !isCancelled && !isWindowOpen && (
        <div className="card card-pad text-sm text-ink-300">
          Maç saati geçti, öneri kapandı. Aşağıdaki öneriler kayıtta duruyor.
        </div>
      )}

      {canPropose && squad.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">{mine ? 'Önerini güncelle' : 'Kendi önerini yap'}</h2>

          <PitchLineup
            squad={squad}
            blackName={blackName}
            whiteName={whiteName}
            action={saveProposal.bind(null, matchId)}
            showRatings={isAdmin}
            initialSpots={mySpots}
            submitLabel={mine ? 'Önerimi güncelle' : 'Önerimi kaydet'}
            note="Başlangıç için bir diziliş hazırlandı. Oyuncuları sürükleyip istediğin gibi değiştir, sonra kaydet."
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Öneriler <span className="badge badge-muted">{proposals.length}</span>
        </h2>

        {proposals.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">Henüz kimse öneri yapmadı.</div>
        ) : (
          proposals.map((p) => {
            const slotsOfProposal = byProposal.get(p.id as string) ?? [];
            const spots = spotsFromSlots(squad, slotsOfProposal);
            const author = p.profiles as unknown as { full_name: string } | null;
            const isMine = p.author_id === profile.id;
            const missing = squad.length - slotsOfProposal.length;

            const black = slotsOfProposal.filter((slot) => slot.team === 'black').length;
            const white = slotsOfProposal.filter((slot) => slot.team === 'white').length;

            // Cok oneri birikince sayfa uzamasin: kartlar kapali gelir,
            // yalnizca kendi onerin acik durur.
            return (
              <details
                key={p.id as string}
                open={isMine}
                className="card card-pad proposal-card"
              >
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-frost-100">
                    {author?.full_name || 'İsimsiz oyuncu'}
                  </span>
                  {isMine && <span className="badge badge-muted">Senin önerin</span>}
                  <span className="badge badge-muted">
                    {blackName} {black} · {whiteName} {white}
                  </span>
                  <span className="hint ml-auto">{formatShort(p.updated_at as string)}</span>
                </summary>

                <div className="mt-3 flex flex-col gap-3">
                <PitchView
                  squad={squad}
                  spots={spots}
                  blackName={blackName}
                  whiteName={whiteName}
                />

                {/* Oneri yapildiktan sonra kadro degistiyse eksik kalmis olabilir */}
                {missing > 0 && (
                  <p className="hint">
                    Bu öneri yapıldıktan sonra kadro değişmiş: {missing} oyuncu sahada
                    görünmüyor.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {isAdmin && (
                    <ToastForm action={applyProposal.bind(null, matchId, p.id as string)}>
                      <button className="btn btn-primary btn-sm">Bu dağılımı uygula</button>
                    </ToastForm>
                  )}
                  {(isMine || isAdmin) && (
                    <ToastForm action={deleteProposal.bind(null, matchId, p.id as string)}>
                      <button className="text-xs text-ink-500 underline">Sil</button>
                    </ToastForm>
                  )}
                </div>
                </div>
              </details>
            );
          })
        )}
      </section>
    </AppShell>
  );
}
