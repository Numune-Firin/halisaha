'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { LEDGER_CATEGORY_DIRECTION, parseLedgerCategory } from '@/lib/ui/ledger';
import { getSquad } from '@/lib/db/squad';
import { formatKickoff } from '@/lib/ui/format';
import { isMailConfigured, sendMail } from '@/lib/mail';

function revalidatePayments(matchId: string) {
  revalidatePath(`/poll/${matchId}/payments`);
  revalidatePath(`/poll/${matchId}`);
  revalidatePath('/admin/accounting');
  revalidatePath('/matches');
  revalidatePath('/');
}

/**
 * O haftanin gelir/giderini yazar: saha ucreti, ikram, bagis... Kayit macin
 * kendisine baglanir, tarihi de macin gunudur; muhasebe ekrani bunlari hafta
 * hafta toplayip gosterir.
 *
 * Oyunculardan toplanan para buraya yazilmaz; o zaten asagidaki kadro
 * listesinden geliyor.
 */
export async function addMatchLedgerEntry(matchId: string, formData: FormData) {
  await requireAdmin();
  const profile = await getCurrentProfile();

  const category = parseLedgerCategory(formData.get('category'));
  const amount = Number(String(formData.get('amount') ?? '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Tutar sıfırdan büyük olmalı');

  const supabase = await createServerSupabase();
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('season_id, kickoff_at')
    .eq('id', matchId)
    .maybeSingle();
  if (matchError) throw new Error(matchError.message);
  if (!match) throw new Error('Maç bulunamadı');

  // Kaydin gunu macin gunudur; ayrica tarih sormaya gerek kalmaz
  const occurredOn = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(
    new Date(match.kickoff_at as string),
  );

  const { error } = await supabase.from('ledger_entries').insert({
    season_id: match.season_id,
    match_id: matchId,
    direction: LEDGER_CATEGORY_DIRECTION[category],
    category,
    amount,
    description: String(formData.get('description') ?? '')
      .trim()
      .slice(0, 200),
    occurred_on: occurredOn,
    created_by: profile?.id ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePayments(matchId);
}

export async function deleteMatchLedgerEntry(matchId: string, entryId: string) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('ledger_entries').delete().eq('id', entryId);
  if (error) throw new Error(error.message);

  revalidatePayments(matchId);
}

/** Tek kisinin odedigi tutari yazar; 0 yazmak odemeyi siler. */
export async function setPayment(matchId: string, squadRowId: string, amount: number) {
  await requireAdmin();
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Tutar negatif olamaz');

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('set_payment', {
    p_squad_id: squadRowId,
    p_amount: amount,
  });
  if (error) throw new Error(error.message);

  revalidatePayments(matchId);
}

/** Satirdaki kutuya yazilan tutari kaydeder. */
export async function savePaymentAmount(
  matchId: string,
  squadRowId: string,
  formData: FormData,
) {
  const amount = Number(String(formData.get('amount') ?? '').replace(',', '.'));
  await setPayment(matchId, squadRowId, amount);
}

/** Butun odemeler tamamlandiginda maci kapatir. */
export async function completeMatch(matchId: string) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('complete_match', { p_match_id: matchId });
  if (error) throw new Error(error.message);

  revalidatePayments(matchId);
}

/** Kapanmis muhasebeyi geri acar; odeme kayitlari yerinde kalir. */
export async function reopenPayments(matchId: string) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('reopen_match_payments', { p_match_id: matchId });
  if (error) throw new Error(error.message);

  revalidatePayments(matchId);
}

/**
 * Odemesi eksik olanlara hatirlatma maili atar: alici odemeyenler, bilgi
 * (CC) yoneticiler. Ayni mac icin ikinci kez gonderilmesin diye bayrak
 * veritabaninda tutulur; p_force ile yonetici yeniden gonderebilir.
 *
 * Adresi olmayan (uye olmayan) oyuncuya mail gitmez; onlar listede ayrica
 * bildirilir.
 */
export async function sendPaymentReminder(matchId: string, force = false) {
  await requireAdmin();

  if (!isMailConfigured()) {
    throw new Error(
      'E-posta ayarları tanımlı değil. Vercel ortam değişkenlerine SMTP_HOST, SMTP_USER ve SMTP_PASS ekle.',
    );
  }

  const supabase = await createServerSupabase();

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('kickoff_at, venue, fee_per_player, payment_reminder_sent_at')
    .eq('id', matchId)
    .maybeSingle();
  if (matchError) throw new Error(matchError.message);
  if (!match) throw new Error('Maç bulunamadı');

  if (force) {
    const { error } = await supabase.rpc('reset_payment_reminder', { p_match_id: matchId });
    if (error) throw new Error(error.message);
  }

  // Bayragi kapan gonderir; ayni anda iki istek gelse de mail bir kez gider
  const { data: claimed, error: claimError } = await supabase.rpc('claim_payment_reminder', {
    p_match_id: matchId,
  });
  if (claimError) throw new Error(claimError.message);
  if (claimed !== true) throw new Error('Bu maç için hatırlatma zaten gönderilmiş');

  const fee = Number(match.fee_per_player ?? 0);
  const squad = await getSquad(matchId);
  const debtors = squad.filter((m) => m.amountPaid < fee);
  const recipients = debtors.map((m) => m.email).filter((e): e is string => Boolean(e));

  if (recipients.length === 0) {
    // Bayragi geri al: gonderecek kimse yoksa hatirlatma harcanmis sayilmasin
    await supabase.rpc('reset_payment_reminder', { p_match_id: matchId });
    throw new Error('Ödemesi eksik olan ve e-posta adresi bulunan kimse yok');
  }

  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .eq('role', 'admin')
    .eq('status', 'active');
  const cc = (admins ?? [])
    .map((a) => a.email as string | null)
    .filter((e): e is string => Boolean(e));

  const when = formatKickoff(match.kickoff_at as string);
  const lines = debtors.map((m) => {
    const remaining = fee - m.amountPaid;
    return `- ${m.fullName}: ${remaining.toLocaleString('tr-TR')} ₺`;
  });

  await sendMail({
    to: recipients,
    cc,
    subject: `Halı saha ödemesi: ${when}`,
    text: [
      `Merhaba,`,
      ``,
      `${when} · ${match.venue || 'saha belirtilmedi'} maçının ödemesi henüz tamamlanmadı.`,
      `Kişi başı ücret: ${fee.toLocaleString('tr-TR')} ₺`,
      ``,
      `Eksik ödemeler:`,
      ...lines,
      ``,
      `Ödemeni yaptıysan bu mesajı dikkate alma.`,
      `Numune Fırın Futbol Ligi`,
    ].join('\n'),
  });

  revalidatePayments(matchId);
}
