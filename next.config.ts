import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Proje disindaki kullanici klasorunde bulunan alakasiz package-lock.json
  // dosyasi Next.js'in workspace kokunu yanlis tahmin etmesine sebep oluyor;
  // kok dizini burada acikca sabitliyoruz.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
