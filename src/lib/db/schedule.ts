import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Anket takvimine gore vakti gelmis maclari olusturur.
 *
 * Idempotenttir: ayni an icin mac zaten varsa hicbir sey yapmaz. Bu yuzden
 * ucretsiz planda ayri bir zamanlanmis gorev kurmak yerine sayfa acilislarinda
 * cagrilir; haftanin anketini, o hafta uygulamayi ilk acan kisi actirmis olur.
 *
 * Hata yutulmaz: takvim calismadiginda anket sessizce acilmamis olur ve
 * kimse farkina varmaz. Cagiran sayfa hatayi gormeli.
 */
export async function ensureScheduledMatches(): Promise<number> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('ensure_scheduled_matches');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}
