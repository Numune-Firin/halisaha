'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { LEDGER_CATEGORY_DIRECTION, parseLedgerCategory } from '@/lib/ui/ledger';
import { runAction } from '@/lib/actions/result';

function revalidateAccounting(matchId?: string | null) {
  revalidatePath('/admin/accounting');
  if (matchId) revalidatePath(`/poll/${matchId}/payments`);
}

/**
 * Kasa duzeltmesi: bir haftaya bagli olmayan gelir/gider. Devir, sayim farki,
 * kasadan odenen tek seferlik masraf gibi durumlar icin.
 *
 * Haftalik gelir/gider yine macin kendi Odemeler sayfasindan girilir; burasi
 * yalnizca sezon geneline yazilan duzeltmeler icindir.
 */
export async function createAdjustmentEntry(seasonId: string, formData: FormData) {
  return runAction('Kasa düzeltmesi eklendi', async () => {
    await requireAdmin();
    const profile = await getCurrentProfile();

    const category = parseLedgerCategory(formData.get('category'));
    const amount = Number(String(formData.get('amount') ?? '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Tutar sıfırdan büyük olmalı');

    const occurredOn = String(formData.get('occurredOn') ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) throw new Error('Geçerli bir tarih gir');

    const supabase = await createServerSupabase();
    const { error } = await supabase.from('ledger_entries').insert({
      season_id: seasonId,
      match_id: null,
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

    revalidateAccounting();
  });
}

/** Kaydi silmeden, ayni tutarda ters yonlu fisle iptal eder. */
export async function reverseEntry(entryId: string, matchId: string | null) {
  return runAction('Ters fiş kesildi', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('reverse_ledger_entry', { p_entry_id: entryId });
    if (error) throw new Error(error.message);

    revalidateAccounting(matchId);
  });
}

/** Kaydi tamamen kaldirir; iz birakmaz. */
export async function deleteEntry(entryId: string, matchId: string | null) {
  return runAction('Kayıt silindi', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.from('ledger_entries').delete().eq('id', entryId);
    if (error) throw new Error(error.message);

    revalidateAccounting(matchId);
  });
}
