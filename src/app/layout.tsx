import { ToastProvider } from '@/components/Toast';
import "./globals.css";

export const metadata = {
  title: 'Numune Fırın Futbol Ligi',
  description: 'Haftalık halı saha anketi, kadro ve puan durumu',
  manifest: '/manifest.json',
  // Sekme ve ana ekran ikonu: public/firin.jpg'den uretilen kare surumler
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * Tema secimi boyanmadan once uygulanir; yoksa koyu temayi seçen kullanici
 * her sayfa acilisinda bir an beyaz ekran gorurdu. localStorage'da kayit
 * yoksa isletim sisteminin tercihi kullanilir.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark = stored ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
