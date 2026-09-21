import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { formatShort } from '@/lib/ui/format';
import { createAdjustment, deleteAdjustment } from './actions';
import { ToastForm } from '@/components/ToastForm';

/** "+8 sn" / "-5 sn" */
function formatSeconds(seconds: number) {
  return seconds > 0 ? `+${seconds} sn` : `${seconds} sn`;
}

export default async function AdjustmentsPage() {
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServerSupabase();

  const { data: members, error: memberError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('status', 'active')
    .order('full_name');
  if (memberError) throw new Error(memberError.message);

  const { data: rows, error: rowError } = await supabase
    .from('adjustments')
    .select('id, player_id, seconds, reason, applied_match_id, created_at, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(60);
  if (rowError) throw new Error(rowError.message);

  const all = rows ?? [];
  const pending = all.filter((r) => r.applied_match_id === null);
  const applied = all.filter((r) => r.applied_match_id !== null);

  return (
    <AppShell
      profile={profile}
      title="Ceza ve ödül"
      subtitle="Bir oyuncunun sonraki ankette giriş saatine eklenecek ya da ondan düşülecek saniyeler."
    >
      <section className="flex flex-col gap-3">
        <h2 className="section-title">Yeni kayıt</h2>

        <ToastForm action={createAdjustment} className="card card-pad flex flex-col gap-4">
          <div className="field">
            <label className="label" htmlFor="playerId">
              Oyuncu
            </label>
            <select id="playerId" name="playerId" required defaultValue="" className="input">
              <option value="" disabled>
                Seç…
              </option>
              {(members ?? []).map((m) => (
                <option key={m.id as string} value={m.id as string}>
                  {(m.full_name as string) || 'İsimsiz oyuncu'}
                </option>
              ))}
            </select>
            <p className="hint">
              Yalnızca üyeler. Aday oyuncular ankete kendileri girmediği için ceza/ödül almaz.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="kind">
                Tür
              </label>
              <select id="kind" name="kind" defaultValue="penalty" className="input">
                <option value="penalty">Ceza — sıra geriye düşer</option>
                <option value="reward">Ödül — sıra öne alınır</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="seconds">
                Saniye
              </label>
              <input
                id="seconds"
                name="seconds"
                type="number"
                min={1}
                required
                defaultValue={8}
                className="input"
              />
              <p className="hint">Giriş saatine eklenir ya da ondan düşülür.</p>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="reason">
              Sebep
            </label>
            <input
              id="reason"
              name="reason"
              type="text"
              placeholder="Örn. son dakika çıktı, forma yıkadı"
              className="input"
            />
            <p className="hint">Listede görünür; herkes neden yazıldığını görebilir.</p>
          </div>

          <button className="btn btn-primary btn-block">Kaydet</button>
        </ToastForm>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Bekleyenler <span className="badge badge-muted">{pending.length}</span>
        </h2>

        {pending.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Bekleyen ceza ya da ödül yok. Yazdığın kayıt, oyuncu bir sonraki ankete girdiğinde
            uygulanır ve buradan düşer.
          </div>
        ) : (
          <ul className="card divide-line">
            {pending.map((r) => {
              const seconds = r.seconds as number;
              const person = r.profiles as unknown as { full_name: string } | null;
              return (
                <li key={r.id as string} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-frost-100">
                      {person?.full_name || 'İsimsiz oyuncu'}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-300">
                      {(r.reason as string) || 'Sebep yazılmadı'} ·{' '}
                      {formatShort(r.created_at as string)}
                    </div>
                  </div>

                  <span className={seconds > 0 ? 'badge badge-danger' : 'badge badge-live'}>
                    {formatSeconds(seconds)}
                  </span>

                  <ToastForm action={deleteAdjustment.bind(null, r.id as string)}>
                    <button className="text-xs text-ink-300 underline">Sil</button>
                  </ToastForm>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Uygulananlar</h2>

        {applied.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">Henüz uygulanmış kayıt yok.</div>
        ) : (
          <ul className="card divide-line">
            {applied.map((r) => {
              const seconds = r.seconds as number;
              const person = r.profiles as unknown as { full_name: string } | null;
              return (
                <li key={r.id as string} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink-100">
                      {person?.full_name || 'İsimsiz oyuncu'}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {(r.reason as string) || 'Sebep yazılmadı'} ·{' '}
                      {formatShort(r.created_at as string)}
                    </div>
                  </div>
                  <span className="badge badge-muted">{formatSeconds(seconds)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
