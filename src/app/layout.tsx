import "./globals.css";

export const metadata = {
  title: 'Numune Fırın Futbol Ligi',
  description: 'Haftalık halı saha anketi, kadro ve puan durumu',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#04120c',
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
