import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { approveMember, deleteInvite, inviteMember } from '../actions';
import { ToastForm } from '@/components/ToastForm';

/**
 * Uyeler ve davetler.
 *
 * Yonetim paneli anket acma ve mac isleriyle doluydu; onay bekleyen uye ile
 * davetler arada kayboluyordu. Kisiyle ilgili isler bu sayfada toplandi,
 * panelde yalnizca bekleyen varsa bir hatirlatma duruyor.
 */
export default async function MembersPage() {
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServerSupabase();

  const { data: pendingMembers } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('status', 'pending');
  const pending = pendingMembers ?? [];

  // Henuz kabul edilmemis davetler
  const { data: inviteRows } = await supabase
    .from('member_invites')
    .select('email, make_admin, note, created_at')
    .is('accepted_at', null)
    .order('created_at', { ascending: false });
  const invites = inviteRows ?? [];

  return (
    <AppShell
      profile={profile}
      title="Üyeler ve davetler"
      subtitle="Onay bekleyenler ve henüz kabul edilmemiş davetler"
      action={
        <Link href="/admin" className="btn btn-ghost btn-sm">
          Yönetim paneli
        </Link>
      }
    >
      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Onay bekleyen üyeler
          {pending.length > 0 && <span className="badge badge-vip">{pending.length}</span>}
        </h2>

        {pending.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">Bekleyen üye yok.</div>
        ) : (
          <ul className="card divide-line">
            {pending.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-frost-100">
                    {m.full_name || 'İsimsiz oyuncu'}
                  </div>
                  <div className="truncate text-xs text-ink-500">
                    {(m.email as string | null) || 'E-posta yok'}
                  </div>
                </div>
                <ToastForm action={approveMember.bind(null, m.id)}>
                  <button className="btn btn-go btn-sm">Onayla</button>
                </ToastForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Davetler <span className="badge badge-muted">{invites.length}</span>
        </h2>

        <ToastForm action={inviteMember} className="card card-pad flex flex-col gap-4">
          <div className="field">
            <label className="label" htmlFor="inviteEmail">
              E-posta adresi
            </label>
            <input
              id="inviteEmail"
              name="email"
              type="email"
              required
              placeholder="arkadas@gmail.com"
              className="input"
            />
            <p className="hint">
              Davetli kişi Google ile girdiği anda onay beklemeden üye olur. Giriş
              yapabilmesi için adresinin Google Cloud tarafinda test kullanıcısı olarak da
              ekli olması gerekir.
            </p>
          </div>

          <div className="field">
            <label className="label" htmlFor="inviteNote">
              Not (isteğe bağlı)
            </label>
            <input
              id="inviteNote"
              name="note"
              type="text"
              maxLength={120}
              placeholder="Örn. kaleci, Ahmet'in arkadaşı"
              className="input"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              name="makeAdmin"
              className="mt-0.5 h-4 w-4 accent-[var(--color-azure-400)]"
            />
            <span>
              <strong>Yönetici olarak açılsın</strong> — giriş yaptığı anda senin yetkilerinle
              başlar: üye onaylama, anket açma, kadro ve skor.
            </span>
          </label>

          <button className="btn btn-primary btn-block">Daveti kaydet</button>
        </ToastForm>

        {invites.length > 0 && (
          <ul className="card divide-line">
            {invites.map((i) => (
              <li
                key={i.email as string}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-frost-100">{i.email as string}</div>
                  <div className="truncate text-xs text-ink-500">
                    {(i.note as string) || 'Not yok'}
                  </div>
                </div>
                {i.make_admin ? (
                  <span className="badge badge-vip">Yönetici</span>
                ) : (
                  <span className="badge badge-muted">Üye</span>
                )}
                <ToastForm action={deleteInvite.bind(null, i.email as string)}>
                  <button className="text-xs text-ink-500 underline">Sil</button>
                </ToastForm>
              </li>
            ))}
          </ul>
        )}
      </section>

    </AppShell>
  );
}
