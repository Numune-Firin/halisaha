import { createServerSupabase } from '@/lib/supabase/server';
import type { CreditEvent } from '@/lib/accounting/credit';

type LedgerRow = {
  person_id: string;
  is_guest: boolean;
  full_name: string;
  occurred_at: string;
  kind: 'match' | 'conversion';
  match_id: string | null;
  squad_id: string | null;
  match_status: string | null;
  category: string | null;
  note: string;
  charged: string | number;
  paid: string | number;
  balance_before: string | number;
  due: string | number;
  balance_after: string | number;
};

function toEvent(row: LedgerRow): CreditEvent {
  return {
    personId: row.person_id,
    isGuest: row.is_guest,
    fullName: row.full_name,
    occurredAt: row.occurred_at,
    kind: row.kind,
    matchId: row.match_id,
    squadId: row.squad_id,
    matchStatus: (row.match_status as CreditEvent['matchStatus']) ?? null,
    category: (row.category as CreditEvent['category']) ?? null,
    note: row.note ?? '',
    charged: Number(row.charged),
    paid: Number(row.paid),
    balanceBefore: Number(row.balance_before),
    due: Number(row.due),
    balanceAfter: Number(row.balance_after),
  };
}

/**
 * Butun oyuncularin hesap dokumu. Kurallarin tamami veritabanindaki
 * player_ledger fonksiyonunda; yonetici degilse bos doner.
 */
export async function getCreditEvents(): Promise<CreditEvent[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('player_ledger');
  if (error) throw new Error(error.message);
  return ((data ?? []) as LedgerRow[]).map(toEvent);
}

export interface MatchDue {
  /** Onceki bakiye islendikten sonra nakit odenmesi gereken tutar */
  due: number;
  /** Bu haftaya girerken oyuncunun alacagi */
  creditBefore: number;
  /** Haftanin ucretinin alacaktan karsilanan kismi */
  creditUsed: number;
  /** Gecmis borcundan bu haftanin ucretine eklenen tutar */
  debtAdded: number;
  balanceAfter: number;
}

/**
 * Bir macin kadro satirlari icin odeme beklentisi. Anahtar match_squad.id.
 */
export async function getMatchDues(matchId: string): Promise<Map<string, MatchDue>> {
  const events = await getCreditEvents();
  const dues = new Map<string, MatchDue>();

  for (const event of events) {
    if (event.matchId !== matchId || !event.squadId) continue;
    dues.set(event.squadId, {
      due: event.due,
      creditBefore: Math.max(0, event.balanceBefore),
      creditUsed: Math.max(0, event.charged - event.due),
      debtAdded: Math.max(0, event.due - event.charged),
      balanceAfter: event.balanceAfter,
    });
  }

  return dues;
}

export interface Conversion {
  id: string;
  personId: string;
  isGuest: boolean;
  fullName: string;
  amount: number;
  category: 'donation' | 'refreshment';
  note: string;
  createdAt: string;
}

/** Alacaktan bagisa/ikrama cevrilen tutarlarin dokumu. */
export async function getConversions(): Promise<Conversion[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('player_credit_conversions')
    // profiles'a iki bag var (player_id ve created_by); hangisi oldugunu yazmak gerekiyor
    .select(
      'id, player_id, guest_id, amount, category, note, created_at, profiles!player_credit_conversions_player_id_fkey(full_name), guest_players(full_name)',
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      player_id: string | null;
      guest_id: string | null;
      amount: string | number;
      category: 'donation' | 'refreshment';
      note: string;
      created_at: string;
      profiles: { full_name: string } | null;
      guest_players: { full_name: string } | null;
    };
    const isGuest = r.player_id === null;
    return {
      id: r.id,
      personId: (r.player_id ?? r.guest_id) as string,
      isGuest,
      fullName: (isGuest ? r.guest_players : r.profiles)?.full_name || 'İsimsiz oyuncu',
      amount: Number(r.amount),
      category: r.category,
      note: r.note ?? '',
      createdAt: r.created_at,
    };
  });
}
