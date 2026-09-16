import "./globals.css";

export const metadata = {
  title: 'Halı Saha',
  description: 'Haftalık halı saha organizasyonu',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
