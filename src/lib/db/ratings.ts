import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Oylama suresi dolmus maclarin MVP'sini hesaplar.
 *
 * Idempotenttir: MVP'si belirlenmis maca tekrar bakmaz. Ucretsiz planda
 * zamanlanmis gorev olmadigi icin takvimde oldugu gibi sayfa acilislarinda
 * cagrilir; sureyi ilk gecen kisi MVP'yi belirlemis olur.
 */
export async function finalizeDueMvps(): Promise<number> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('finalize_due_mvps');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

export interface RatingSummary {
  /** Uye ise profiles.id, aday oyuncu ise guest_players.id */
  participantId: string;
  isGuest: boolean;
  average: number;
  votes: number;
}

/**
 * Herkesin genel yildiz ortalamasi. Tek tek oylar gizlidir; bu ozet yalnizca
 * ortalama ve oy sayisini dondurur, kimin ne verdigini sizdirmaz.
 */
export async function getRatingSummary(): Promise<Map<string, RatingSummary>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('rating_summary');
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    participant_id: string;
    is_guest: boolean;
    average: number | string;
    votes: number;
  }[];

  return new Map(
    rows.map((r) => [
      r.participant_id,
      {
        participantId: r.participant_id,
        isGuest: r.is_guest,
        average: Number(r.average),
        votes: r.votes,
      },
    ]),
  );
}
