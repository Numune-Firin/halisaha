'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { parsePosition } from '@/lib/ui/position';
import { parseTier } from '@/lib/ui/tier';

/**
 * Uyenin mevkisini yazar. Admin herkesin, oyuncu yalnizca kendi mevkisini
 * degistirebilir; ayni sinir veritabaninda da RLS ile (profiles_update_own /
 * profiles_update_admin) durur, buradaki kontrol hatayi anlasilir kilar.
 */
export async function setPlayerPosition(playerId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');
  if (profile.role !== 'admin' && profile.id !== playerId) throw new Error('Yetkisiz');

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({ position: parsePosition(formData.get('position')) })
    .eq('id', playerId);
  if (error) throw new Error(error.message);

  revalidatePath('/players');
}

/** Aday oyuncunun kendi hesabi yoktur; mevkisini yalnizca admin yazar. */
export async function setGuestPosition(guestId: string, formData: FormData) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('guest_players')
    .update({ position: parsePosition(formData.get('position')) })
    .eq('id', guestId);
  if (error) throw new Error(error.message);

  revalidatePath('/players');
}

/**
 * Adayligi elle degistirir. promotion_locked ile isaretlenir: otomatik kural
 * (belirlenen sayida mac oynayani asil yapan promote_eligible_guests) bu kayda
 * bir daha karismaz, yoksa adayliga geri alinan biri ilk macta yine asil olurdu.
 */
export async function setGuestRegular(guestId: string, isRegular: boolean) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('guest_players')
    .update({
      is_regular: isRegular,
      promoted_at: isRegular ? new Date().toISOString() : null,
      promotion_locked: true,
    })
    .eq('id', guestId);
  if (error) throw new Error(error.message);

  revalidatePath('/players');
  revalidatePath('/matches');
}

/** Ayrilan aday oyuncu listeden dusurulur; gecmis maclardaki kaydi durur. */
export async function setGuestActive(guestId: string, isActive: boolean) {
  await requireAdmin();

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('guest_players')
    .update({ is_active: isActive })
    .eq('id', guestId);
  if (error) throw new Error(error.message);

  revalidatePath('/players');
}

/**
 * Genel yildizi elle yazar ya da (deger bos ise) siler. Bos birakilinca
 * oyuncunun butun maclardan gelen ortalamasi yeniden gecerli olur.
 *
 * Yalnizca yonetici; kendi satirini da degistirebilir.
 */
export async function setOverrideRating(
  kind: 'member' | 'guest',
  id: string,
  formData: FormData,
) {
  await requireAdmin();

  const raw = String(formData.get('rating') ?? '').replace(',', '.').trim();
  let rating: number | null = null;
  if (raw) {
    rating = Number(raw);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error('Yıldız 1 ile 5 arasında olmalı');
    }
    rating = Math.round(rating * 10) / 10;
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from(kind === 'member' ? 'profiles' : 'guest_players')
    .update({ override_rating: rating })
    .eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/players');
}

/**
 * Elle oyuncu tanimlar. Google hesabi olmayan, parayla tutulan kaleci gibi
 * kisiler icin: bir kez yazilir, sonraki haftalarda listeden secilir.
 * "Asil oyuncu" isaretlenirse adaylik rozeti hic cikmaz ve otomatik kural
 * bu kayda karismaz.
 */
export async function createPlayer(formData: FormData) {
  await requireAdmin();

  const fullName = String(formData.get('fullName') ?? '').trim();
  if (!fullName) throw new Error('Ad soyad boş olamaz');

  const isRegular = formData.get('isRegular') === 'on';

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('guest_players').insert({
    full_name: fullName.slice(0, 80),
    position: parsePosition(formData.get('position')),
    is_regular: isRegular,
    promoted_at: isRegular ? new Date().toISOString() : null,
    promotion_locked: isRegular,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/players');
}

/**
 * Siralama katmanini yazar: normal, oncelikli ya da VIP (sabit oyuncu).
 * VIP olan kisi bundan sonra acilan her ankete kendiliginden yazilir.
 * Acik bir anket varsa oradaki satiri da ayni anda guncellenir; yoksa
 * degisiklik ancak gelecek hafta gorunurdu.
 */
export async function setPlayerTier(
  kind: 'member' | 'guest',
  id: string,
  formData: FormData,
) {
  await requireAdmin();
  const tier = parseTier(formData.get('tier'));

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from(kind === 'member' ? 'profiles' : 'guest_players')
    .update({ tier })
    .eq('id', id);
  if (error) throw new Error(error.message);

  const { error: syncError } = await supabase.rpc('sync_open_poll_tiers');
  if (syncError) throw new Error(syncError.message);

  revalidatePath('/players');
  revalidatePath('/');
}

/**
 * Uyeyi yonetici yapar ya da yoneticilikten cikarir.
 *
 * Son yonetici cikarilamaz: kimse kalmazsa uye onaylayacak, anket acacak,
 * kadro kesinlestirecek kimse olmaz ve sisteme geri girilemez.
 */
export async function setMemberRole(playerId: string, makeAdmin: boolean) {
  await requireAdmin();

  const supabase = await createServerSupabase();

  if (!makeAdmin) {
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('status', 'active');
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) throw new Error('Son yöneticiyi çıkaramazsın');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ role: makeAdmin ? 'admin' : 'player' })
    .eq('id', playerId)
    .select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error('Üye bulunamadı');

  revalidatePath('/players');
  revalidatePath('/admin');
}
