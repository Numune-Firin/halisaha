'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { evaluateWithdrawal } from '@/lib/poll/withdrawal';
import { sumOffsets, consumableIds } from '@/lib/poll/offsets';
import { runAction } from '@/lib/actions/result';

/**
 * Ankete giris. Bekleyen ceza/odulleri toplayip ofset olarak yazar ve tuketir.
 * Giris zamanini veritabani tetikleyicisi sunucu saatiyle yazar.
 *
 * Kimlik dogrulamasi burada (getCurrentProfile) yapilir. Bekleyen ceza/odul kaydi
 * normal istemciyle okunur; `adjustments_select` politikasi `is_active_member()`
 * ile herkese aciktir (RLS burada satirlari baskasinin player_id'sinden
 * gizlemez) — gercek koruma asagidaki `.eq('player_id', profile.id)` filtresi
 * ve RPC'nin kendi `p_player_id` parametresine gore tekrar filtrelemesidir.
 * Yazim, kuralca hesaplanmis degerlerle, servis anahtarli istemci uzerinden
 * yalnizca service_role'a acik olan RPC'ye tek cagriyla yapilir.
 */
export async function joinPoll(matchId: string) {
  return runAction('Ankete girdin', async () => {
    const profile = await getCurrentProfile();
    if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

    const supabase = await createServerSupabase();

    // Bu maca ait kayitlar disarida birakilir: leave_poll gec cikis cezasini
    // source_match_id = <bu mac> ile yazar; anket hala acikken tekrar girildiginde
    // ceza ayni maca uygulanip bedelsiz tuketilirdi. Spec: ceza BIR SONRAKI ankete.
    // `.neq()` tek basina source_match_id'si null olan satirlari da elerdi
    // (SQL'de null <> x -> null); admin'in elle yazdigi ceza/odullerin
    // source_match_id'si null oldugu icin `or` ile acikca dahil ediliyor.
    const { data: pendingRows, error: pendingError } = await supabase
      .from('adjustments')
      .select('id, player_id, seconds')
      .eq('player_id', profile.id)
      .is('applied_match_id', null)
      .or(`source_match_id.is.null,source_match_id.neq.${matchId}`);
    if (pendingError) throw new Error(pendingError.message);

    const pending = (pendingRows ?? []).map((r) => ({
      id: r.id as string,
      playerId: r.player_id as string,
      seconds: r.seconds as number,
    }));

    const offset = sumOffsets(pending);
    const consumed = consumableIds(pending);

    // Giris ve ceza tuketimi tek bir RPC ile, tek islemde yapilir: hem ilk giris
    // hem de cikip tekrar girme ayni yoldan gecer, ceza kayitlari ya hep birlikte
    // tuketilir ya da hic yazilmaz (kopma durumunda kaybolmaz/iki kez uygulanmaz).
    const { error } = await createServiceSupabase().rpc('join_poll', {
      p_match_id: matchId,
      p_player_id: profile.id,
      p_offset: offset,
      p_consumed_ids: consumed,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/poll/${matchId}`);
  });
}

/** Anketten cikis. Pencere disindaysa bir sonraki ankete ceza yazar. */
export async function leavePoll(matchId: string) {
  return runAction('Anketten çıktın', async () => {
    const profile = await getCurrentProfile();
    if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

    const supabase = await createServerSupabase();

    const { data: match } = await supabase
      .from('matches')
      .select('kickoff_at, withdrawal_window_hours, late_withdrawal_penalty_seconds')
      .eq('id', matchId)
      .single();
    if (!match) throw new Error('Maç bulunamadı');

    const { isLate, penaltySeconds } = evaluateWithdrawal({
      now: Date.now(),
      kickoffAt: new Date(match.kickoff_at as string).getTime(),
      windowHours: match.withdrawal_window_hours as number,
      penaltySeconds: match.late_withdrawal_penalty_seconds as number,
    });

    const { error } = await createServiceSupabase().rpc('leave_poll', {
      p_match_id: matchId,
      p_player_id: profile.id,
      p_is_late: isLate,
      p_penalty_seconds: penaltySeconds,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/poll/${matchId}`);
  });
}

/**
 * Butonun tek eylemi: hangi yonde islem yapilacagina render aninda yakalanan
 * degil, veritabaninin o anki durumuna bakarak karar verir. Sayfa render
 * edildikten sonra oyuncu baska bir sekmeden/cihazdan zaten girmis/cikmis
 * olabilir ya da butona iki kez tiklayabilir; bu durumda eski "isListed"
 * bilgisine gore dallanmak yanlis RPC'yi cagirip (orn. zaten ankette olan
 * birini tekrar "girise" sokup sirasini sifirlayarak) veri bozabilirdi.
 */
export async function togglePollEntry(matchId: string) {
  return runAction('Liste güncellendi', async () => {
    const profile = await getCurrentProfile();
    if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

    const supabase = await createServerSupabase();

    const { data: entry, error } = await supabase
      .from('match_entries')
      .select('withdrawn_at')
      .eq('match_id', matchId)
      .eq('player_id', profile.id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const hasOpenEntry = !!entry && entry.withdrawn_at === null;

    // Asil islemin kendi sonucu (ve hatasi) oldugu gibi gecer
    return hasOpenEntry ? leavePoll(matchId) : joinPoll(matchId);
  });
}

/**
 * Admin ankete mevcut bir uyeyi ya da daha once tanimlanmis bir aday oyuncuyu
 * elle ekler. Secim degeri "m:<uuid>" (uye) ya da "g:<uuid>" (aday) bicimindedir;
 * tek bir acilir listede iki turu birlikte gosterebilmek icin boyle onekli.
 */
export async function adminAddParticipant(matchId: string, formData: FormData) {
  return runAction('Listeye eklendi', async () => {
    await requireAdmin();

    // Birden fazla kisi birlikte secilebilir; hepsi ayni sirayla eklenir
    const picked = formData
      .getAll('participant')
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (picked.length === 0) throw new Error('Eklenecek kişiyi seç');

    const supabase = await createServerSupabase();

    for (const raw of picked) {
      const [kind, id] = raw.split(':');
      if ((kind !== 'm' && kind !== 'g') || !id) throw new Error('Eklenecek kişi anlaşılmadı');

      const { error } = await supabase.rpc('admin_add_entry', {
        p_match_id: matchId,
        p_player_id: kind === 'm' ? id : null,
        p_guest_id: kind === 'g' ? id : null,
      });
      if (error) throw new Error(error.message);
    }

    revalidatePath(`/poll/${matchId}`);
  });
}

/**
 * Yeni bir aday oyuncu tanimlar ve ayni anda ankete ekler. Aday oyuncu kaydi
 * kalicidir: sonraki maclarda listeden tekrar secilebilir.
 */
export async function adminAddNewGuest(matchId: string, formData: FormData) {
  return runAction('Oyuncu tanımlandı ve listeye eklendi', async () => {
    await requireAdmin();

    const fullName = ((formData.get('fullName') as string) ?? '').trim();
    if (!fullName) throw new Error('Aday oyuncunun adı gerekli');
    const position = ((formData.get('position') as string) ?? '').trim() || null;

    const supabase = await createServerSupabase();
    const { data: guest, error: insertError } = await supabase
      .from('guest_players')
      .insert({ full_name: fullName, position })
      .select('id')
      .single();
    if (insertError) throw new Error(insertError.message);

    const { error } = await supabase.rpc('admin_add_entry', {
      p_match_id: matchId,
      p_player_id: null,
      p_guest_id: guest.id,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/poll/${matchId}`);
  });
}

/**
 * Admin bir kaydi listeden tamamen cikarir. Oyuncunun kendi cikisi degildir:
 * yanlislikla eklenen kisiyi temizler, bu yuzden gec cikis cezasi yazilmaz.
 */
export async function adminRemoveEntry(matchId: string, participantId: string, isGuest: boolean) {
  return runAction('Listeden çıkarıldı', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('admin_remove_entry', {
      p_match_id: matchId,
      p_player_id: isGuest ? null : participantId,
      p_guest_id: isGuest ? participantId : null,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/poll/${matchId}`);
  });
}

/**
 * Haftayi iptal eder (tatil, kar, kontenjanin dolmamasi...). Mac satiri silinmez:
 * durdugu surece haftalik takvim ayni gun icin yeni bir mac uretmez.
 */
/**
 * Bu haftaya ozel bilgiler: saha, kisi basi ucret, kadro mevcudu ve haftanin
 * sponsoru. Takvimden gelen degerler yalnizca baslangic degeridir; burada
 * degistirilen yalnizca bu maci etkiler.
 */
export async function updateMatchDetails(matchId: string, formData: FormData) {
  return runAction('Hafta bilgileri kaydedildi', async () => {
    await requireAdmin();

    const fee = Number(String(formData.get('feePerPlayer') ?? '').replace(',', '.'));
    const squadSize = Number(formData.get('squadSize'));
    if (!Number.isFinite(fee) || fee < 0) throw new Error('Ücret negatif olamaz');
    if (!Number.isInteger(squadSize) || squadSize < 2 || squadSize > 40) {
      throw new Error('Kadro mevcudu 2 ile 40 arasında olmalı');
    }

    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from('matches')
      .update({
        venue: String(formData.get('venue') ?? '').trim(),
        fee_per_player: fee,
        squad_size: squadSize,
        sponsor_name: String(formData.get('sponsorName') ?? '').trim().slice(0, 60),
      })
      .eq('id', matchId)
      .select('id');
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) throw new Error('Maç bulunamadı');

    revalidatePath(`/poll/${matchId}`);
    revalidatePath(`/poll/${matchId}/payments`);
    revalidatePath('/matches');
    revalidatePath('/');
  });
}

/**
 * Yanlislikla acilan maci tamamen siler. Kurallar veritabaninda:
 * yalnizca anketi acik ya da iptal edilmis, kadrosu kesinlesmemis, skoru
 * girilmemis ve kasa hareketi olmayan mac silinebilir.
 */
export async function deleteMatch(matchId: string) {
  return runAction('Maç silindi', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('delete_match', { p_match_id: matchId });
    if (error) throw new Error(error.message);

    revalidatePath('/matches');
    revalidatePath('/');
    redirect('/matches');
  });
}

/** Skor beklemeden maci oynandi yapar; oylama bununla acilir. */
export async function markMatchPlayed(matchId: string) {
  return runAction('Maç oynandı olarak işaretlendi', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('mark_match_played', { p_match_id: matchId });
    if (error) throw new Error(error.message);

    revalidatePath(`/poll/${matchId}`);
    revalidatePath(`/poll/${matchId}/ratings`);
    revalidatePath('/matches');
    revalidatePath('/');
  });
}

export async function cancelMatch(matchId: string, formData: FormData) {
  return runAction('Hafta iptal edildi', async () => {
    await requireAdmin();

    const reason = String(formData.get('reason') ?? '').trim();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('cancel_match', {
      p_match_id: matchId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/poll/${matchId}`);
    revalidatePath('/matches');
    revalidatePath('/');
  });
}

/** Yanlislikla iptal edilen haftayi birakildigi duruma geri dondurur. */
export async function restoreMatch(matchId: string) {
  return runAction('Hafta geri alındı', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('restore_match', { p_match_id: matchId });
    if (error) throw new Error(error.message);

    revalidatePath(`/poll/${matchId}`);
    revalidatePath('/matches');
    revalidatePath('/');
  });
}
