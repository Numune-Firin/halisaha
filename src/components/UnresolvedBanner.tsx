import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { formatKickoff } from '@/lib/ui/format';
import { cancelMatch } from '@/app/poll/[matchId]/actions';
import { ToastForm } from '@/components/ToastForm';

/**
 * Askida kalan hafta uyarisi.
 *
 * Bir hafta iki sekilde askida kalir: mac saati gecmis ama hala "anket acik" /
 * "kadro kesin" duruyordur, ya da oynandi sayilmis ama skoru girilmemistir.
 * Ikisi de puan durumunu ve muhasebeyi eksik birakir, o yuzden yoneticiye her
 * sayfada gosterilir ve karar buradan verilebilir.
 *
 * Skorsuz hafta iptal edilemez: oynanmis mac iptal edilmez, skoru girilir.
 *
 * Ayni uyari gunluk bakim isinde e-posta olarak da gider (src/lib/db/maintenance.ts).
 */
export async function UnresolvedBanner() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('unresolved_matches');

  const pending = (data ?? []) as {
    id: string;
    kickoff_at: string;
    venue: string | null;
    status: string;
  }[];
  if (pending.length === 0) return null;

  return (
    <section className="card card-pad mb-4 border-amber-500/40 bg-amber-500/5">
      <h2 className="text-sm font-semibold text-amber-400">
        {pending.length === 1 ? 'Sonuçlanmamış bir hafta var' : `Sonuçlanmamış ${pending.length} hafta var`}
      </h2>
      <p className="hint mt-1">
        Yeni anket açılmadan önce bu haftaları kapatman gerekiyor: maç oynandıysa oyuncuları
        iki takıma dağıtıp skoru gir, oynanmadıysa sebebini yazıp iptal et. Skoru girilmeyen
        hafta puan durumuna ve kasaya girmez.
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {pending.map((match) => {
          // Oylamasi acilmis ama skorsuz kalmis hafta: artik iptal secenegi yok
          const isPlayed = match.status === 'played' || match.status === 'completed';

          return (
            <li
              key={match.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0"
            >
              <Link href={`/poll/${match.id}`} className="text-sm font-medium underline">
                {formatKickoff(match.kickoff_at)}
              </Link>
              {match.venue && <span className="hint">{match.venue}</span>}
              {isPlayed && <span className="badge badge-danger">Skor girilmedi</span>}

              <Link
                href={`/poll/${match.id}/result`}
                className="btn btn-sm btn-primary ml-auto whitespace-nowrap"
              >
                Takımlar ve skor
              </Link>

              {!isPlayed && (
                <ToastForm
                  action={cancelMatch.bind(null, match.id)}
                  className="flex shrink-0 items-center gap-2"
                >
                  <input
                    name="reason"
                    type="text"
                    maxLength={200}
                    required
                    placeholder="İptal sebebi"
                    className="input h-8 w-44 text-sm"
                  />
                  <button className="btn btn-sm btn-danger whitespace-nowrap">İptal et</button>
                </ToastForm>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
