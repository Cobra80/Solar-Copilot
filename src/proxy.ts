import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Portail d'authentification (HTTP Basic Auth) pour le déploiement en ligne.
//
// - En PRODUCTION : `APP_PASSWORD` DOIT être défini, sinon l'app est verrouillée
//   (503). On ne laisse jamais un déploiement public accessible sans mot de passe.
// - En LOCAL (dev) : si `APP_PASSWORD` n'est pas défini, l'accès reste libre.
//
// Une fois authentifié, le navigateur renvoie l'en-tête `Authorization` sur toutes
// les requêtes de l'origine — pages ET appels `/api` déclenchés par le fetch client.

const REALM = 'Basic realm="Solar Copilot", charset="UTF-8"';

function unauthorized(): NextResponse {
  return new NextResponse("Authentification requise.", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

// Comparaison à temps constant (ne court-circuite pas selon le contenu/longueur).
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length);
  }
  return diff === 0;
}

export function proxy(request: NextRequest): NextResponse {
  const password = process.env.APP_PASSWORD;

  if (!password) {
    // Fail-closed : jamais de déploiement public ouvert par défaut.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Configuration requise : définis la variable d'environnement APP_PASSWORD.",
        { status: 503 },
      );
    }
    return NextResponse.next(); // dev local : accès libre
  }

  const expectedUser = process.env.APP_USER || "solar";
  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      return unauthorized();
    }
    const sep = decoded.indexOf(":");
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    // On évalue les deux comparaisons sans court-circuit conditionnel.
    const okUser = safeEqual(user, expectedUser);
    const okPass = safeEqual(pass, password);
    if (okUser && okPass) return NextResponse.next();
  }
  return unauthorized();
}

export const config = {
  // Protège tout, sauf les assets statiques et les fichiers PWA (manifest + icônes) :
  // ceux-ci ne contiennent rien de sensible et doivent rester accessibles pour que
  // le chargement des ressources et l'installation de la PWA fonctionnent.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
