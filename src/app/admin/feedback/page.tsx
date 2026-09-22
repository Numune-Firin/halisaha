import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/supabase/requireAdmin';
import { createServerSupabase, getCurrentProfile } from '@/lib/supabase/server';
import { formatShort } from '@/lib/ui/format';
import {
  FEEDBACK_KIND_BADGES,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_STATUS_BADGES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_OPTIONS,
  type FeedbackKind,
  type FeedbackStatus,
} from '@/lib/ui/feedback';
import { ToastForm } from '@/components/ToastForm';
import { deleteFeedback, replyFeedback, setFeedbackStatus } from '@/app/feedback/actions';

type ItemRow = {
  id: string;
  kind: FeedbackKind;
  subject: string;
  body: string;
  status: FeedbackStatus;
  created_at: string;
  profiles: { full_name: string; email: string | null } | null;
};

type ReplyRow = {
  id: string;
  item_id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

/**
 * Yoneticinin istek, sikayet ve tesekkur ekrani.
 *
 * Acik kayitlar (yeni ve inceleniyor) ustte durur; cozulen ve kapatilanlar
 * altta, katlanmis halde bekler. Cevap yazmak kaydi kendiliginden
 * "inceleniyor"a tasir, isi bitirince durumu elle "cozuldu" yaparsin.
 */
export default async function AdminFeedbackPage() {
  await requireAdmin();
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServerSupabase();

  const { data: itemRows, error } = await supabase
    .from('feedback_items')
    .select('id, kind, subject, body, status, created_at, profiles(full_name, email)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const items = (itemRows ?? []) as unknown as ItemRow[];

  const { data: replyRows } = await supabase
    .from('feedback_replies')
    .select('id, item_id, body, created_at, profiles(full_name)')
    .order('created_at');
  const replies = (replyRows ?? []) as unknown as ReplyRow[];

  const open = items.filter((i) => i.status === 'new' || i.status === 'in_review');
  const done = items.filter((i) => i.status === 'resolved' || i.status === 'closed');
  const repliesOf = (itemId: string) => replies.filter((r) => r.item_id === itemId);

  const card = (item: ItemRow) => (
    <article key={item.id} className="card card-pad flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className={FEEDBACK_KIND_BADGES[item.kind]}>
          {FEEDBACK_KIND_LABELS[item.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-frost-100">
          {item.subject}
        </span>
        <span className={FEEDBACK_STATUS_BADGES[item.status]}>
          {FEEDBACK_STATUS_LABELS[item.status]}
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span className="text-ink-300">{item.profiles?.full_name || 'İsimsiz oyuncu'}</span>
        {item.profiles?.email && <span>· {item.profiles.email}</span>}
        <span className="ml-auto">{formatShort(item.created_at)}</span>
      </div>

      <p className="whitespace-pre-line text-sm text-ink-300">{item.body}</p>

      {repliesOf(item.id).length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-[color:var(--line)] pt-2">
          {repliesOf(item.id).map((reply) => (
            <li key={reply.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-frost-100">
                  {reply.profiles?.full_name || 'Yönetici'}
                </span>
                <span className="hint ml-auto">{formatShort(reply.created_at)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-line text-sm text-ink-300">{reply.body}</p>
            </li>
          ))}
        </ul>
      )}

      <ToastForm
        action={replyFeedback.bind(null, item.id)}
        className="flex flex-col gap-2 border-t border-[color:var(--line)] pt-3"
      >
        <textarea
          name="body"
          rows={3}
          maxLength={2000}
          required
          placeholder="Cevabını yaz — gönderen kendi sayfasında görecek"
          aria-label="Cevap"
          className="input"
        />
        <button className="btn btn-primary btn-sm self-start">Cevap gönder</button>
      </ToastForm>

      <div className="flex flex-wrap items-center gap-3">
        <ToastForm
          action={setFeedbackStatus.bind(null, item.id)}
          className="flex items-center gap-2"
        >
          <select
            name="status"
            // Cevap yazilinca durum kendiliginden degisir; kutu da yenilensin
            key={item.status}
            defaultValue={item.status}
            aria-label="Durum"
            className="input input-sm w-36"
          >
            {FEEDBACK_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm">Durumu kaydet</button>
        </ToastForm>

        <ToastForm action={deleteFeedback.bind(null, item.id)}>
          <button className="text-xs text-ink-500 underline">Sil</button>
        </ToastForm>
      </div>
    </article>
  );

  return (
    <AppShell
      profile={profile}
      title="İstek ve şikayetler"
      subtitle="Üyelerden gelen istek, şikayet ve teşekkürler"
    >
      <section className="flex flex-col gap-3">
        <h2 className="section-title">
          Açık kayıtlar <span className="badge badge-vip">{open.length}</span>
        </h2>

        {open.length === 0 ? (
          <div className="card card-pad text-sm text-ink-300">
            Bekleyen bir şey yok. Yeni mesaj geldiğinde burada görünür.
          </div>
        ) : (
          open.map(card)
        )}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">
            Kapanmış kayıtlar <span className="badge badge-muted">{done.length}</span>
          </h2>

          {done.map((item) => (
            <details key={item.id} className="card card-pad proposal-card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className={FEEDBACK_KIND_BADGES[item.kind]}>
                  {FEEDBACK_KIND_LABELS[item.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-frost-100">
                  {item.subject}
                </span>
                <span className={FEEDBACK_STATUS_BADGES[item.status]}>
                  {FEEDBACK_STATUS_LABELS[item.status]}
                </span>
                <span className="hint">{formatShort(item.created_at)}</span>
              </summary>

              <div className="mt-3">{card(item)}</div>
            </details>
          ))}
        </section>
      )}
    </AppShell>
  );
}
