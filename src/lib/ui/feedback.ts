/**
 * Istek, sikayet ve tesekkur kayitlarinin ekrandaki karsiliklari.
 *
 * Tur ve durum degerleri veritabanindaki enum'lardan gelir; burada yalnizca
 * Turkce adlari ve rozet bicimleri durur.
 */

export type FeedbackKind = 'request' | 'complaint' | 'thanks';
export type FeedbackStatus = 'new' | 'in_review' | 'resolved' | 'closed';

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  request: 'İstek',
  complaint: 'Şikayet',
  thanks: 'Teşekkür',
};

/** Yazarken secilen siradaki tur; istek en sik kullanilan oldugu icin basta. */
export const FEEDBACK_KIND_OPTIONS: { value: FeedbackKind; label: string; hint: string }[] = [
  { value: 'request', label: 'İstek', hint: 'Bir şeyin değişmesini ya da eklenmesini istiyorsan' },
  { value: 'complaint', label: 'Şikayet', hint: 'Rahatsız eden bir durumu bildirmek için' },
  { value: 'thanks', label: 'Teşekkür', hint: 'İyi giden bir şey varsa söyle, moral olur' },
];

export const FEEDBACK_KIND_BADGES: Record<FeedbackKind, string> = {
  request: 'badge badge-priority',
  complaint: 'badge badge-danger',
  thanks: 'badge badge-live',
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'Yeni',
  in_review: 'İnceleniyor',
  resolved: 'Çözüldü',
  closed: 'Kapatıldı',
};

export const FEEDBACK_STATUS_BADGES: Record<FeedbackStatus, string> = {
  new: 'badge badge-vip',
  in_review: 'badge badge-priority',
  resolved: 'badge badge-live',
  closed: 'badge badge-muted',
};

/** Yoneticinin durum kutusunda gorecegi sira: is akisinin dogal sirasi. */
export const FEEDBACK_STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = (
  ['new', 'in_review', 'resolved', 'closed'] as FeedbackStatus[]
).map((value) => ({ value, label: FEEDBACK_STATUS_LABELS[value] }));

/** Form alanindan gelen metni gecerli bir ture cevirir. */
export function parseFeedbackKind(value: FormDataEntryValue | null): FeedbackKind {
  const text = String(value ?? '');
  return (['request', 'complaint', 'thanks'] as FeedbackKind[]).includes(text as FeedbackKind)
    ? (text as FeedbackKind)
    : 'request';
}

/** Form alanindan gelen metni gecerli bir duruma cevirir. */
export function parseFeedbackStatus(value: FormDataEntryValue | null): FeedbackStatus {
  const text = String(value ?? '');
  return (['new', 'in_review', 'resolved', 'closed'] as FeedbackStatus[]).includes(
    text as FeedbackStatus,
  )
    ? (text as FeedbackStatus)
    : 'new';
}
