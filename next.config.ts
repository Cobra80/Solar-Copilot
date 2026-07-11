import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (et son moteur pdfjs-dist) ne se bundle pas proprement :
  // on le laisse chargé tel quel depuis node_modules côté serveur.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
