import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { formatShort } from '@/lib/ui/format';
import {
  FEEDBACK_KIND_BADGES,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KIND_OPTIONS,
  FEEDBACK_STATUS_BADGES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackKind,
  type FeedbackStatus,
} from '@/lib/ui/feedback';
import { ToastForm } from '@/components/ToastForm';
import { createFeedback, deleteFeedback } from './actions';

type ReplyRow = {
  id: string;
  item_id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

/**
 * Uyenin istek, sikayet ve tesekkur sayfasi.
 *
 * Yazilan mesaji yalnizca yazan ve yoneticiler gorur; baska bir uye kimsenin
 * yazdigini goremez. Yonetici cevap yazinca kayit "inceleniyor"a gecer ve
 * cevap burada, mesajin altinda durur.
 */
export default async function FeedbackPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') redirect('/pending-approval');

  const supabase = await createServerSupabase();

  // RLS karar veriyor: bu sorgu yalnizca kendi kayitlarini dondurur
  const { data: itemRows, error } = await supabase
    .from('feedback_items')
    .select('id, kind, subject, body, status, created_at')
    .eq('author_id', profile.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const items = itemRows ?? [];

  const { data: replyRows } = await supabase
    .from('feedback_replies')
    .select('id, item_id, body, created_at, profiles(full_name)')
    .in(
      'item_id',
      items.length > 0
        ? items.map((i) => i.id as string)
        : ['00000000-0000-0000-0000-000000000000'],
    )
    .order('created_at');
  const replies = (replyRows ?? []) as unknown as ReplyRow[];

  const repliesOf = (itemId: string) => replies.filter((r) => r.item_id === itemId);

  return (
    <AppShell
      profile={profile}
      title="İstek ve şikayet"
      subtitle="Yöneticilere ulaşmanın yolu: bir şey iste, bir şeyi şikayet et ya da teşekkür et"
    >
      <section className="flex flex-col gap-3">
        <h2 className="section-title">Yeni mesaj</h2>

        <ToastForm action={createFeedback} className="card card-pad flex flex-col gap-4">
          <div className="field">
            <span className="label">Ne yazmak istiyorsun?</span>
            <div className="flex flex-col gap-2">
              {FEEDBACK_KIND_OPTIONS.map((option, index) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2 text-sm text-ink-100"
                >
                  <input
                    type="radio"
                    name="kind"
                    value={option.value}
                    defaultChecked={index === 0}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-azure-400)]"
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <span className="block text-xs text-ink-500">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="subject">
              Başlık
            </label>
            <input
              id="subject"
              name="subject"
              type="text"
              required
              minLength={3}
              maxLength={120}
              placeholder="Örn. Saha saati bir saat öne alınsın"
              className="input"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="body">
              Mesaj
            </label>
            <textarea
              id="body"
              name="body"
              rows={5}
              required
              minLength={3}
              maxLength={2000}
              placeholder="Olabildiğince açık yaz: ne oldu, ne olmasını istiyorsun?"
              className="input"
            />
            <p className="hint">
              Mesajını yalnızca sen ve yöneticiler görür. Başka bir oyuncu göremez.
            </p>
          </div>

          <button className="btn btn-primary btn-block">Gönder</button>
        </ToastForm>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Gönderdiklerin <span className="badge badge-muted">{items.length}</span>
        </h2>

        {items.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Henüz bir şey yazmadın. Aklına takılan varsa yukarıdan yaz.
          </div>
        ) : (
          items.map((item) => {
            const kind = item.kind as FeedbackKind;
            const status = item.status as FeedbackStatus;
            const answers = repliesOf(item.id as string);

            return (
              <article key={item.id as string} className="card card-pad flex flex-col gap-2">
                <header className="flex flex-wrap items-center gap-2">
                  <span className={FEEDBACK_KIND_BADGES[kind]}>
                    {FEEDBACK_KIND_LABELS[kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-frost-100">
                    {item.subject as string}
                  </span>
                  <span className={FEEDBACK_STATUS_BADGES[status]}>
                    {FEEDBACK_STATUS_LABELS[status]}
                  </span>
                </header>

                <p className="whitespace-pre-line text-sm text-ink-300">
                  {item.body as string}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="hint">{formatShort(item.created_at as string)}</span>
                  <ToastForm action={deleteFeedback.bind(null, item.id as string)}>
                    <button className="text-xs text-ink-500 underline">Geri çek</button>
                  </ToastForm>
                </div>

                {answers.length > 0 && (
                  <ul className="flex flex-col gap-2 border-t border-[color:var(--line)] pt-2">
                    {answers.map((reply) => (
                      <li key={reply.id}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="badge badge-vip">Yönetici cevabı</span>
                          <span className="text-sm font-semibold text-frost-100">
                            {reply.profiles?.full_name || 'Yönetici'}
                          </span>
                          <span className="hint ml-auto">{formatShort(reply.created_at)}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-line text-sm text-ink-300">
                          {reply.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })
        )}
      </section>
    </AppShell>
  );
}
