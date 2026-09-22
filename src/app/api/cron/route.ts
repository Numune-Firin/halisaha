import { NextResponse } from 'next/server';
import {
  cleanupOldProposals,
  ensureScheduledMatches,
  finalizeMvps,
  notifyUnresolvedMatches,
  sendDuePaymentReminders,
} from '@/lib/db/maintenance';

/**
 * Zamanlanmis bakim ucu.
 *
 * Kimse uygulamayi acmasa bile calismasi gereken isler burada toplanir:
 *   - periyodik takvimin yaklasan haftalarini acmak
 *   - oylama suresi dolan maclarin MVP'sini belirlemek
 *   - maktan 24 saat sonra odemesi eksik olanlara hatirlatma yollamak
 *   - sonucu girilmemis (askida) haftalar icin yoneticileri uyarmak
 *   - gecmis haftalarin kadro onerilerini temizlemek
 *
 * Disaridan tetiklenir, o yuzden tek koruma paylasilan bir sirdir:
 * CRON_SECRET. Vercel Cron bu degiskeni gorunce istegi kendiliginden
 * "Authorization: Bearer <secret>" basligiyla gonderir; GitHub Actions
 * ya da baska bir zamanlayici da ayni basligi gonderebilir.
 *
 * Her is tekrar calistirmaya dayaniklidir: bayraklar veritabaninda tutulur,
 * gunde bir kez de calissa on dakikada bir de, ayni mail iki kez gitmez.
 */

// Onbellege alinmaz; her istekte gercekten calisir
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function run() {
  // Biri patlarsa digerleri yine de calissin; hata raporda gorunur
  const jobs = {
    schedule: ensureScheduledMatches,
    mvp: finalizeMvps,
    reminders: sendDuePaymentReminders,
    unresolved: notifyUnresolvedMatches,
    proposals: cleanupOldProposals,
  } as const;

  const result: Record<string, number | string> = {};
  let failed = false;

  for (const [name, job] of Object.entries(jobs)) {
    try {
      result[name] = await job();
    } catch (error) {
      failed = true;
      result[name] = `hata: ${error instanceof Error ? error.message : 'bilinmeyen'}`;
    }
  }

  return NextResponse.json(
    { ranAt: new Date().toISOString(), ...result },
    { status: failed ? 500 : 200 },
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }
  return run();
}

// Bazi zamanlayicilar POST atar
export const POST = GET;
