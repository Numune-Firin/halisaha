import 'server-only';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { formatKickoff } from '@/lib/ui/format';
import { isMailConfigured, sendMail } from '@/lib/mail';

/**
 * Zamanlanmis bakim isleri.
 *
 * Bu dosyadaki isler kimseye bagli degildir: bir cron tetikler, RLS'i atlayan
 * servis istemcisiyle calisir. Uygulama icinden de cagrilabilsin diye ayri
 * tutulur; hepsi tekrar calistirmaya dayaniklidir (idempotent).
 */

interface AdminContact {
  email: string;
}

async function adminEmails(supabase: ReturnType<typeof createServiceSupabase>) {
  const { data } = await supabase
    .from('profiles')
    .select('email')
    .eq('role', 'admin')
    .eq('status', 'active');

  return (data ?? [])
    .map((a) => a.email as string | null)
    .filter((e): e is string => Boolean(e));
}

/**
 * Askida kalmis haftalar icin yoneticilere haber verir: saati gecmis ama hala
 * anket acik / kadro kesin duranlar ve oynandi sayilip skoru girilmemis olanlar.
 * Her hafta icin bir kez gider; hafta sonuclandiginda bayrak temizlenir.
 *
 * Ayni tanim veritabanindaki unresolved_matches() icinde de var: ekran onu
 * cagirir, bu is service_role ile dogrudan tabloyu okur.
 */
export async function notifyUnresolvedMatches(): Promise<number> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, status, black_score, white_score, unresolved_notified_at')
    .or(
      'status.in.(poll_open,squad_locked),' +
        'and(status.in.(played,completed),or(black_score.is.null,white_score.is.null))',
    )
    .lt('kickoff_at', new Date().toISOString())
    .is('unresolved_notified_at', null);
  if (error) throw new Error(error.message);

  const pending = data ?? [];
  if (pending.length === 0) return 0;

  const admins: AdminContact[] = (await adminEmails(supabase)).map((email) => ({ email }));
  let sent = 0;

  for (const match of pending) {
    // Bayragi once kapatiriz: iki cron ustuste calissa bile mail bir kez gider
    const { data: claimed, error: claimError } = await supabase
      .from('matches')
      .update({ unresolved_notified_at: new Date().toISOString() })
      .eq('id', match.id as string)
      .is('unresolved_notified_at', null)
      .select('id');
    if (claimError) throw new Error(claimError.message);
    if ((claimed ?? []).length === 0) continue;

    if (!isMailConfigured() || admins.length === 0) continue;

    const when = formatKickoff(match.kickoff_at as string);
    const isPlayed = match.status === 'played' || match.status === 'completed';

    await sendMail({
      to: admins.map((a) => a.email),
      subject: `Sonuçlanmamış hafta: ${when}`,
      text: [
        'Merhaba,',
        '',
        isPlayed
          ? `${when} · ${match.venue || 'saha belirtilmedi'} maçı oynandı görünüyor ama skoru`
          : `${when} · ${match.venue || 'saha belirtilmedi'} maçının saati geçti ama hâlâ sonucu`,
        isPlayed
          ? 'girilmemiş. Skorsuz maç puan durumuna işlemez, hafta yarım kalır:'
          : 'girilmemiş. Yeni hafta açılmadan önce bu haftayı kapatman gerekiyor:',
        '',
        isPlayed
          ? '  - Maç sayfasındaki "Takımlar ve skor" ekranından skoru gir'
          : '  - Maç oynandıysa: oyuncuları iki takıma dağıtıp skoru gir',
        ...(isPlayed ? [] : ['  - Oynanmadıysa: "Haftayı iptal et" ve sebebini yaz']),
        '',
        'Aksi halde puan durumu ve muhasebe eksik kalır.',
        'Numune Fırın Futbol Ligi',
      ].join('\n'),
    });
    sent += 1;
  }

  return sent;
}

/**
 * Takvimi ileri sarar: periyodik anketlerin yaklasan haftalarini acar.
 * Daha once yalnizca biri uygulamayi acinca calisiyordu.
 */
export async function ensureScheduledMatches(): Promise<number> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc('ensure_scheduled_matches');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

/**
 * Gecmis haftalarin kadro onerilerini siler.
 *
 * Oneri yalnizca mac oncesi anlamlidir; mac sonuclaninca tetikleyici zaten
 * temizler. Bu is, durumu elle degistirilmis ya da hic sonuclandirilmamis
 * haftalarda kalan artiklari toplar.
 */
export async function cleanupOldProposals(): Promise<number> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc('cleanup_old_proposals');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

/** Oylama suresi dolmus maclarin MVP'sini belirler. */
export async function finalizeMvps(): Promise<number> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc('finalize_due_mvps');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

/**
 * Mac saatinden 24 saat gecmis, odemesi eksik haftalar icin hatirlatma yollar.
 * Ayni hafta icin tek sefer; gonderim ani macin satirinda tutulur.
 */
export async function sendDuePaymentReminders(): Promise<number> {
  if (!isMailConfigured()) return 0;

  const supabase = createServiceSupabase();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('matches')
    .select('id, kickoff_at, venue, fee_per_player')
    .in('status', ['played'])
    .lt('kickoff_at', dayAgo)
    .is('payment_reminder_sent_at', null);
  if (error) throw new Error(error.message);

  const admins = await adminEmails(supabase);
  let sent = 0;

  for (const match of data ?? []) {
    const fee = Number(match.fee_per_player ?? 0);

    const { data: squad, error: squadError } = await supabase
      .from('match_squad')
      .select('amount_paid, player_id, profiles(full_name, email), guest_players(full_name)')
      .eq('match_id', match.id as string);
    if (squadError) throw new Error(squadError.message);

    // Aday oyuncunun e-postasi yoktur; listede gorunur ama mail gitmez
    const debtors = (squad ?? [])
      .filter((row) => Number(row.amount_paid ?? 0) < fee)
      .map((row) => {
        const isGuest = row.player_id === null;
        const person = (isGuest ? row.guest_players : row.profiles) as unknown as {
          full_name: string;
          email?: string | null;
        } | null;
        return {
          name: person?.full_name ?? 'İsimsiz oyuncu',
          email: person?.email ?? null,
          remaining: fee - Number(row.amount_paid ?? 0),
        };
      });

    const recipients = debtors
      .map((d) => d.email)
      .filter((e): e is string => Boolean(e));
    if (recipients.length === 0) continue;

    const { data: claimed, error: claimError } = await supabase
      .from('matches')
      .update({ payment_reminder_sent_at: new Date().toISOString() })
      .eq('id', match.id as string)
      .is('payment_reminder_sent_at', null)
      .select('id');
    if (claimError) throw new Error(claimError.message);
    if ((claimed ?? []).length === 0) continue;

    const when = formatKickoff(match.kickoff_at as string);
    await sendMail({
      to: recipients,
      cc: admins,
      subject: `Halı saha ödemesi: ${when}`,
      text: [
        'Merhaba,',
        '',
        `${when} · ${match.venue || 'saha belirtilmedi'} maçının ödemesi henüz tamamlanmadı.`,
        `Kişi başı ücret: ${fee.toLocaleString('tr-TR')} ₺`,
        '',
        'Eksik ödemeler:',
        ...debtors.map((d) => `- ${d.name}: ${d.remaining.toLocaleString('tr-TR')} ₺`),
        '',
        'Ödemeni yaptıysan bu mesajı dikkate alma.',
        'Numune Fırın Futbol Ligi',
      ].join('\n'),
    });
    sent += 1;
  }

  return sent;
}
