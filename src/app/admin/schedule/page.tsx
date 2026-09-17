import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { formatKickoff } from '@/lib/ui/format';
import { WEEKDAY_LABELS, WEEKDAY_OPTIONS, nextOccurrences } from '@/lib/ui/schedule';
import {
  createSchedule,
  deleteSchedule,
  generateScheduledMatches,
  setScheduleActive,
  updateSchedule,
} from './actions';

type ScheduleRow = {
  id: string;
  weekday: number;
  start_time: string;
  venue: string;
  squad_size: number;
  fee_per_player: number;
  withdrawal_window_hours: number;
  late_withdrawal_penalty_seconds: number;
  poll_weekday: number;
  poll_open_time: string;
  is_active: boolean;
};

export default async function SchedulePage() {
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServerSupabase();

  const { data: schedules, error } = await supabase
    .from('match_schedules')
    .select('*')
    .order('weekday')
    .order('start_time');
  if (error) throw new Error(error.message);

  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('*')
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);

  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .maybeSingle();
  if (seasonError) throw new Error(seasonError.message);

  const rows = (schedules ?? []) as ScheduleRow[];

  return (
    <AppShell
      profile={profile}
      title="Anket takvimi"
      subtitle="Anket gününü ve maç gününü bir kez tanımla; her hafta kendiliğinden tekrarlansın. Tanım sezona bağlı değildir, yeni sezonda da aynı şekilde devam eder."
    >
      {!season && (
        <div className="card card-pad text-sm text-ink-300">
          Şu an aktif bir sezon yok. Takvim yine çalışır ama açılan maçlar hiçbir sezona
          bağlanmaz.{' '}
          <Link href="/admin/seasons" className="text-azure-400 underline">
            Sezon tanımla
          </Link>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Yeni takvim tanımla</h2>
        <form action={createSchedule} className="card card-pad flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="pollWeekday">
                Anket günü
              </label>
              <select id="pollWeekday" name="pollWeekday" defaultValue={1} className="input">
                {WEEKDAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="hint">Girişler her hafta bu gün açılır.</p>
            </div>

            <div className="field">
              <label className="label" htmlFor="pollOpenTime">
                Anket saati
              </label>
              <input
                id="pollOpenTime"
                name="pollOpenTime"
                type="time"
                required
                defaultValue="12:00"
                className="input"
              />
              <p className="hint">Türkiye saati. Liste tam bu anda açılır.</p>
            </div>

            <div className="field">
              <label className="label" htmlFor="weekday">
                Maç günü
              </label>
              <select id="weekday" name="weekday" defaultValue={4} className="input">
                {WEEKDAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="hint">Maç her hafta bu gün oynanır.</p>
            </div>

            <div className="field">
              <label className="label" htmlFor="startTime">
                Maç saati
              </label>
              <input
                id="startTime"
                name="startTime"
                type="time"
                required
                defaultValue="22:15"
                className="input"
              />
              <p className="hint">Türkiye saati.</p>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="venue">
              Saha
            </label>
            <input
              id="venue"
              name="venue"
              type="text"
              placeholder="Örn. Numune Halı Saha, 2 numaralı saha"
              className="input"
            />
            <p className="hint">Her hafta açılan maça bu saha yazılır.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
                defaultValue={settings?.squad_size ?? 14}
                className="input"
              />
              <p className="hint">7-7 oynuyorsanız 14. Sonrakiler yedek listesine düşer.</p>
            </div>

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
                defaultValue={settings?.fee_per_player ?? 0}
                className="input"
              />
              <p className="hint">Saha ücretinin kişi başına düşen payı.</p>
            </div>

            <div className="field">
              <label className="label" htmlFor="withdrawalWindow">
                Serbest çıkış süresi (saat)
              </label>
              <input
                id="withdrawalWindow"
                name="withdrawalWindow"
                type="number"
                min={0}
                defaultValue={settings?.withdrawal_window_hours ?? 20}
                className="input"
              />
              <p className="hint">Maça bu kadar saat kalana dek cezasız çıkılabilir.</p>
            </div>

            <div className="field">
              <label className="label" htmlFor="lateWithdrawalPenalty">
                Geç çıkış cezası (saniye)
              </label>
              <input
                id="lateWithdrawalPenalty"
                name="lateWithdrawalPenalty"
                type="number"
                min={0}
                defaultValue={settings?.late_withdrawal_penalty_seconds ?? 8}
                className="input"
              />
              <p className="hint">Sonraki ankette giriş saatine eklenir.</p>
            </div>
          </div>

          <button className="btn btn-primary btn-block">Takvimi oluştur</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Tanımlı takvimler</h2>

        {rows.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Henüz takvim yok. Yukarıdan ilk takvimi tanımla; ondan sonra her hafta anketi elle
            açman gerekmez.
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {rows.map((schedule) => {
                const upcoming = nextOccurrences(schedule.weekday, schedule.start_time, 3);
                return (
                  <li key={schedule.id} className="card card-pad">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-frost-100">
                            Her {WEEKDAY_LABELS[schedule.weekday]} {schedule.start_time.slice(0, 5)}
                          </h3>
                          {schedule.is_active ? (
                            <span className="badge badge-live">Açık</span>
                          ) : (
                            <span className="badge badge-muted">Duraklatıldı</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-ink-300">
                          {schedule.venue || 'Saha belirtilmedi'} · {schedule.squad_size} kişi ·{' '}
                          {schedule.fee_per_player} ₺
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          Anket her {WEEKDAY_LABELS[schedule.poll_weekday]}{' '}
                          {schedule.poll_open_time.slice(0, 5)} açılır
                        </p>
                      </div>

                      <div className="flex gap-2">
                        {schedule.is_active ? (
                          <form action={setScheduleActive.bind(null, schedule.id, false)}>
                            <button className="btn btn-ghost btn-sm">Duraklat</button>
                          </form>
                        ) : (
                          <form action={setScheduleActive.bind(null, schedule.id, true)}>
                            <button className="btn btn-go btn-sm">Devam ettir</button>
                          </form>
                        )}
                      </div>
                    </div>

                    {schedule.is_active && upcoming.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1 border-t border-[color:var(--line)] pt-3">
                        {upcoming.map((iso) => (
                          <li key={iso} className="text-xs text-ink-300">
                            {formatKickoff(iso)}
                          </li>
                        ))}
                      </ul>
                    )}

                    <details className="mt-3 border-t border-[color:var(--line)] pt-3">
                      <summary className="cursor-pointer text-sm font-medium text-azure-400">
                        Düzenle
                      </summary>
                      <form
                        action={updateSchedule.bind(null, schedule.id)}
                        className="mt-3 flex flex-col gap-3"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="field">
                            <label className="label">Anket günü</label>
                            <select
                              name="pollWeekday"
                              defaultValue={schedule.poll_weekday}
                              className="input"
                            >
                              {WEEKDAY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label className="label">Anket saati</label>
                            <input
                              name="pollOpenTime"
                              type="time"
                              required
                              defaultValue={schedule.poll_open_time.slice(0, 5)}
                              className="input"
                            />
                          </div>
                          <div className="field">
                            <label className="label">Maç günü</label>
                            <select
                              name="weekday"
                              defaultValue={schedule.weekday}
                              className="input"
                            >
                              {WEEKDAY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label className="label">Maç saati</label>
                            <input
                              name="startTime"
                              type="time"
                              required
                              defaultValue={schedule.start_time.slice(0, 5)}
                              className="input"
                            />
                          </div>
                        </div>

                        <div className="field">
                          <label className="label">Saha</label>
                          <input
                            name="venue"
                            type="text"
                            defaultValue={schedule.venue}
                            className="input"
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="field">
                            <label className="label">Kadro mevcudu</label>
                            <input
                              name="squadSize"
                              type="number"
                              min={2}
                              max={40}
                              defaultValue={schedule.squad_size}
                              className="input"
                            />
                          </div>
                          <div className="field">
                            <label className="label">Kişi başı ücret (₺)</label>
                            <input
                              name="feePerPlayer"
                              type="number"
                              min={0}
                              step="0.01"
                              defaultValue={schedule.fee_per_player}
                              className="input"
                            />
                          </div>
                          <div className="field">
                            <label className="label">Serbest çıkış (saat)</label>
                            <input
                              name="withdrawalWindow"
                              type="number"
                              min={0}
                              defaultValue={schedule.withdrawal_window_hours}
                              className="input"
                            />
                          </div>
                          <div className="field">
                            <label className="label">Geç çıkış cezası (sn)</label>
                            <input
                              name="lateWithdrawalPenalty"
                              type="number"
                              min={0}
                              defaultValue={schedule.late_withdrawal_penalty_seconds}
                              className="input"
                            />
                          </div>
                        </div>

                        <p className="hint">
                          Değişiklik yalnızca bundan sonra açılacak maçlara işler; açılmış
                          anketler olduğu gibi kalır.
                        </p>

                        <button className="btn btn-ghost btn-sm self-start">Kaydet</button>
                      </form>

                      <form
                        action={deleteSchedule.bind(null, schedule.id)}
                        className="mt-3 border-t border-[color:var(--line)] pt-3"
                      >
                        <button className="btn btn-danger btn-sm">Takvimi sil</button>
                        <p className="hint mt-1">
                          Açılmış maçlar silinmez, yalnızca yenileri açılmaz.
                        </p>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>

            <form action={generateScheduledMatches}>
              <button className="btn btn-ghost btn-block">Vakti gelenleri şimdi oluştur</button>
            </form>
          </>
        )}
      </section>
    </AppShell>
  );
}
