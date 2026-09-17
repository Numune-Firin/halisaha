import nodemailer from 'nodemailer';

/**
 * Basit SMTP gonderimi. Ayarlar ortam degiskenlerinden okunur; hicbiri kodda
 * ya da depoda durmaz:
 *
 *   SMTP_HOST   smtp.gmail.com
 *   SMTP_PORT   465
 *   SMTP_USER   gonderen@gmail.com
 *   SMTP_PASS   Google uygulama sifresi (hesap sifresi DEGIL)
 *   SMTP_FROM   "Numune Fırın Futbol Ligi <gonderen@gmail.com>"  (istege bagli)
 *
 * Ayar yoksa gonderim denenmez; cagiran taraf anlasilir bir hata gorur.
 */
export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export interface MailMessage {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (!isMailConfigured()) {
    throw new Error(
      'E-posta ayarları tanımlı değil. SMTP_HOST, SMTP_USER ve SMTP_PASS değerlerini gir.',
    );
  }
  if (message.to.length === 0) {
    throw new Error('Alıcı yok');
  }

  const port = Number(process.env.SMTP_PORT ?? 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 dogrudan TLS, 587 once duz baglanip STARTTLS'e gecer
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: message.to,
    cc: message.cc?.length ? message.cc : undefined,
    subject: message.subject,
    text: message.text,
  });
}
