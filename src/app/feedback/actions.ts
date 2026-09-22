'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { runAction } from '@/lib/actions/result';
import { parseFeedbackKind, parseFeedbackStatus } from '@/lib/ui/feedback';

function revalidateFeedback() {
  revalidatePath('/feedback');
  revalidatePath('/admin/feedback');
}

/** Uye kendi adina istek, sikayet ya da tesekkur yazar. */
export async function createFeedback(formData: FormData) {
  return runAction('Mesajın iletildi', async () => {
    const profile = await getCurrentProfile();
    if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

    const subject = String(formData.get('subject') ?? '').trim();
    const body = String(formData.get('body') ?? '').trim();

    if (subject.length < 3) throw new Error('Başlık en az 3 karakter olmalı');
    if (body.length < 3) throw new Error('Mesaj en az 3 karakter olmalı');

    const supabase = await createServerSupabase();
    const { error } = await supabase.from('feedback_items').insert({
      author_id: profile.id,
      kind: parseFeedbackKind(formData.get('kind')),
      subject: subject.slice(0, 120),
      body: body.slice(0, 2000),
    });
    if (error) throw new Error(error.message);

    revalidateFeedback();
  });
}

/** Yazan kendi kaydini geri ceker; yonetici herhangi birini kaldirabilir. */
export async function deleteFeedback(itemId: string) {
  return runAction('Kayıt silindi', async () => {
    const profile = await getCurrentProfile();
    if (!profile || profile.status !== 'active') throw new Error('Yetkisiz');

    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from('feedback_items')
      .delete()
      .eq('id', itemId)
      .select('id');
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) throw new Error('Bu kaydı silemezsin');

    revalidateFeedback();
  });
}

/** Yonetici cevap yazar; kayit kendiliginden "inceleniyor"a gecer. */
export async function replyFeedback(itemId: string, formData: FormData) {
  return runAction('Cevabın gönderildi', async () => {
    const profile = await requireAdmin();

    const body = String(formData.get('body') ?? '').trim();
    if (!body) throw new Error('Cevap boş olamaz');

    const supabase = await createServerSupabase();
    const { error } = await supabase.from('feedback_replies').insert({
      item_id: itemId,
      author_id: profile.id,
      body: body.slice(0, 2000),
    });
    if (error) throw new Error(error.message);

    revalidateFeedback();
  });
}

/** Yonetici kaydin durumunu isaretler: yeni, inceleniyor, cozuldu, kapatildi. */
export async function setFeedbackStatus(itemId: string, formData: FormData) {
  return runAction('Durum güncellendi', async () => {
    await requireAdmin();

    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from('feedback_items')
      .update({
        status: parseFeedbackStatus(formData.get('status')),
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .select('id');
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) throw new Error('Kayıt bulunamadı');

    revalidateFeedback();
  });
}
