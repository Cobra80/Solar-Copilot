import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Portail d'authentification par session (cookie signé).
//
// - En PRODUCTION : `APP_PASSWORD` DOIT être défini, sinon l'app est verrouillée (503).
// - En LOCAL (dev) : si `APP_PASSWORD` n'est pas défini, l'accès reste libre.
//
// Sans session valide : les pages sont redirigées vers /login, les appels /api
// reçoivent un 401. La page /login et l'API /api/login restent toujours accessibles.

const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout"]);

export function proxy(request: NextRequest): NextResponse {
  const password = process.env.APP_PASSWORD;
  const { pathname } = request.nextUrl;

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

  // Connexion / déconnexion toujours accessibles.
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // Session valide → on laisse passer.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(token)) return NextResponse.next();

  // Non authentifié : API → 401 JSON ; pages → redirection vers /login (avec retour).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Protège tout, sauf les assets statiques et les fichiers PWA (manifest + icônes).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
