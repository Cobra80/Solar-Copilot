import type { MetadataRoute } from "next";

// Manifest PWA : rend l'app installable sur l'écran d'accueil (iOS / Android),
// en plein écran (sans barre d'adresse du navigateur).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Solar Copilot",
    short_name: "Solar Copilot",
    description:
      "Boîte à outils IA pour techniciens O&M photovoltaïque : rapports, analyse de logs, carnet, second cerveau, procédures.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
