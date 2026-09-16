import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hali Saha",
  description: "Hali saha organizasyon uygulamasi",
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
