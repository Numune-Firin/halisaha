'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { ensureScheduledMatches } from '@/lib/db/schedule';

function readScheduleForm(formData: FormData) {
  const weekday = Number(formData.get('weekday'));
  const startTime = ((formData.get('startTime') as string) ?? '').trim();
  const pollWeekday = Number(formData.get('pollWeekday'));
  const pollOpenTime = ((formData.get('pollOpenTime') as string) ?? '').trim();

  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new Error('Geçerli bir maç günü seç');
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) {
    throw new Error('Geçerli bir maç saati gir');
  }
  if (!Number.isInteger(pollWeekday) || pollWeekday < 1 || pollWeekday > 7) {
    throw new Error('Geçerli bir anket günü seç');
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(pollOpenTime)) {
    throw new Error('Geçerli bir anket saati gir');
  }

  return {
    weekday,
    start_time: startTime,
    venue: ((formData.get('venue') as string) ?? '').trim(),
    squad_size: Number(formData.get('squadSize') ?? 14),
    fee_per_player: Number(formData.get('feePerPlayer') ?? 0),
    withdrawal_window_hours: Number(formData.get('withdrawalWindow') ?? 20),
    late_withdrawal_penalty_seconds: Number(formData.get('lateWithdrawalPenalty') ?? 8),
    poll_weekday: pollWeekday,
    poll_open_time: pollOpenTime,
  };
}

/** Takvim degistiginde vakti gelmis maclar hemen olusturulur ki admin sonucu gorsun. */
async function refresh() {
  await ensureScheduledMatches();
  revalidatePath('/admin/schedule');
  revalidatePath('/admin');
  revalidatePath('/matches');
  revalidatePath('/');
}

export async function createSchedule(formData: FormData) {
  await requireAdmin();
  const row = readScheduleForm(formData);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('match_schedules').insert(row);
  if (error) throw new Error(error.message);

  await refresh();
}

export async function updateSchedule(scheduleId: string, formData: FormData) {
  await requireAdmin();
  const row = readScheduleForm(formData);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('match_schedules')
    .update(row)
    .eq('id', scheduleId)
    .select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error('Takvim bulunamadı');

  await refresh();
}

export async function setScheduleActive(scheduleId: string, isActive: boolean) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('match_schedules')
    .update({ is_active: isActive })
    .eq('id', scheduleId)
    .select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error('Takvim bulunamadı');

  await refresh();
}

/**
 * Takvimi siler. Bu takvimden dogmus maclar SILINMEZ; schedule_id alani
 * null'a duser (on delete set null) ve maclar anketleriyle birlikte yerinde kalir.
 */
export async function deleteSchedule(scheduleId: string) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('match_schedules').delete().eq('id', scheduleId);
  if (error) throw new Error(error.message);

  await refresh();
}

/** "Şimdi oluştur": bekleme olmadan vakti gelmis maclari actirir. */
export async function generateScheduledMatches() {
  await requireAdmin();
  await refresh();
}
