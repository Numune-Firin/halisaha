/**
 * Sunucu islemlerinin (server action) ortak cevabi.
 *
 * Eskiden islemler hata firlatiyordu: kullanici Kaydet'e basinca ya hicbir sey
 * olmuyor gibi gorunuyor ya da sayfa komple hata ekranina dusuyordu. Artik her
 * islem "oldu mu, olmadiysa neden" bilgisini geri donuyor; ekrandaki bildirim
 * bunu gosteriyor.
 *
 * Onemli: Next.js'in yonlendirme (redirect) ve "sayfa yok" sinyalleri de hata
 * gibi firlatilir. Onlar yakalanmaz, oldugu gibi gecirilir; yoksa yonlendirme
 * calismaz.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Next.js'in kendi ic sinyali mi (redirect / notFound)? */
function isFrameworkSignal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND');
}

/**
 * Islemi calistirir, sonucu bildirime uygun bicimde dondurur.
 *
 *   export async function saveThing(formData: FormData) {
 *     return runAction('Kaydedildi', async () => { ... });
 *   }
 */
export async function runAction(
  successMessage: string,
  body: () => Promise<void | ActionResult>,
): Promise<ActionResult> {
  try {
    // Islem baska bir islemi cagiriyorsa onun sonucu oldugu gibi gecer;
    // boylece "kaydedildi" derken aslinda hata alinmis olmaz
    const inner = await body();
    if (inner) return inner;
    return { ok: true, message: successMessage };
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : 'İşlem tamamlanamadı',
    };
  }
}
