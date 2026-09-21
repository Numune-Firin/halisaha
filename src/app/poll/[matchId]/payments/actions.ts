'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { LEDGER_CATEGORY_DIRECTION, parseLedgerCategory } from '@/lib/ui/ledger';
import { getSquad } from '@/lib/db/squad';
import { formatKickoff } from '@/lib/ui/format';
import { isMailConfigured, sendMail } from '@/lib/mail';
import { runAction } from '@/lib/actions/result';

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
  return runAction('Kasa hareketi eklendi', async () => {
    await requireAdmin();
    const profile = await getCurrentProfile();

    const category = parseLedgerCategory(formData.get('category'));
    const amount = Number(String(formData.get('amount') ?? '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Tutar sıfırdan büyük olmalı');

    const supabase = await createServerSupabase();
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('season_id, kickoff_at, status')
      .eq('id', matchId)
      .maybeSingle();
    if (matchError) throw new Error(matchError.message);
    if (!match) throw new Error('Maç bulunamadı');
    if (match.status === 'cancelled') {
      throw new Error('İptal edilmiş hafta için gelir/gider yazılamaz');
    }
    if (match.status === 'completed') {
      throw new Error('Bu haftanın muhasebesi kapandı. Önce "Muhasebeyi geri aç" de.');
    }

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
  });
}

/**
 * Kapanmis haftanin parasi degistirilemez: once "Muhasebeyi geri ac" demek
 * gerekir. Ayni kural odeme icin veritabaninda da var (set_payment); kasa
 * hareketleri bu uygulamada yalnizca buradan yazildigi icin kontrol burada.
 */
async function assertWeekOpen(matchId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('matches')
    .select('status')
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Maç bulunamadı');
  if (data.status === 'completed') {
    throw new Error('Bu haftanın muhasebesi kapandı. Önce "Muhasebeyi geri aç" de.');
  }
  if (data.status === 'cancelled') {
    throw new Error('İptal edilmiş hafta için gelir/gider yazılamaz');
  }
}

/**
 * Ters fis: yanlis kaydi silmek yerine ayni tutarda ters yonlu bir fis keser.
 * Ikisi birbirini goturur, gecmis okunur kalir. Muhasebede dogrusu budur;
 * "Sil" yalnizca daha o an girilmis, hic kimsenin gormedigi kayit icindir.
 */
export async function reverseMatchLedgerEntry(matchId: string, entryId: string) {
  return runAction('Ters fiş kesildi', async () => {
    await requireAdmin();
    await assertWeekOpen(matchId);

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('reverse_ledger_entry', { p_entry_id: entryId });
    if (error) throw new Error(error.message);

    revalidatePayments(matchId);
  });
}

export async function deleteMatchLedgerEntry(matchId: string, entryId: string) {
  return runAction('Kayıt silindi', async () => {
    await requireAdmin();
    await assertWeekOpen(matchId);

    const supabase = await createServerSupabase();
    const { error } = await supabase.from('ledger_entries').delete().eq('id', entryId);
    if (error) throw new Error(error.message);

    revalidatePayments(matchId);
  });
}

/** Tek kisinin odedigi tutari yazar; 0 yazmak odemeyi siler. */
export async function setPayment(matchId: string, squadRowId: string, amount: number) {
  return runAction('Ödeme kaydedildi', async () => {
    await requireAdmin();
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Tutar negatif olamaz');

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('set_payment', {
      p_squad_id: squadRowId,
      p_amount: amount,
    });
    if (error) throw new Error(error.message);

    revalidatePayments(matchId);
  });
}

/**
 * Secilen kisilerin odemesini tek seferde yazar.
 *
 * On dort kisiyi tek tek isaretlemek yerine hepsini ya da eksik kalanlari
 * birlikte kapatmak icin. Tutar herkese ayni yazilir: tam ucret ya da sifir
 * (odemeyi geri almak).
 */
export async function setPaymentsBulk(matchId: string, squadRowIds: string[], amount: number) {
  return runAction('Ödemeler kaydedildi', async () => {
    await requireAdmin();
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Tutar negatif olamaz');
    if (squadRowIds.length === 0) throw new Error('Kimse seçilmedi');

    const supabase = await createServerSupabase();
    for (const squadRowId of squadRowIds) {
      const { error } = await supabase.rpc('set_payment', {
        p_squad_id: squadRowId,
        p_amount: amount,
      });
      if (error) throw new Error(error.message);
    }

    revalidatePayments(matchId);

    const kisi = `${squadRowIds.length} kişi`;
    return {
      ok: true,
      message: amount > 0 ? `${kisi} ödedi olarak işaretlendi` : `${kisi} için ödeme geri alındı`,
    };
  });
}

/** Satirdaki kutuya yazilan tutari kaydeder. */
export async function savePaymentAmount(
  matchId: string,
  squadRowId: string,
  formData: FormData,
) {
  return runAction('Ödeme kaydedildi', async () => {
    const amount = Number(String(formData.get('amount') ?? '').replace(',', '.'));
    return setPayment(matchId, squadRowId, amount);
  });
}

/** Butun odemeler tamamlandiginda maci kapatir. */
export async function completeMatch(matchId: string) {
  return runAction('Muhasebe kapatıldı', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('complete_match', { p_match_id: matchId });
    if (error) throw new Error(error.message);

    revalidatePayments(matchId);
  });
}

/** Kapanmis muhasebeyi geri acar; odeme kayitlari yerinde kalir. */
export async function reopenPayments(matchId: string) {
  return runAction('Muhasebe geri açıldı', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('reopen_match_payments', { p_match_id: matchId });
    if (error) throw new Error(error.message);

    revalidatePayments(matchId);
  });
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
  return runAction('Hatırlatma gönderildi', async () => {
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
  });
}
