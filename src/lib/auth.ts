import { createHmac, timingSafeEqual } from "node:crypto";

// Session d'authentification par cookie signé (remplace le Basic Auth qui
// redemandait le mot de passe en permanence).
//
// Le cookie contient un jeton `v1.<expiration>.<signature>` où la signature est
// un HMAC-SHA256 dont la clé est APP_PASSWORD. Conséquences :
// - impossible à forger sans connaître APP_PASSWORD (côté serveur uniquement) ;
// - le mot de passe n'apparaît jamais dans le cookie ;
// - changer APP_PASSWORD invalide toutes les sessions existantes.

export const SESSION_COOKIE = "sc_session";

// Durée de vie de la session : 1 an → en pratique, on se connecte « une fois ».
const MAX_AGE_DAYS = 365;
export const SESSION_MAX_AGE = MAX_AGE_DAYS * 24 * 60 * 60; // secondes (pour le cookie) — 1 an
const VERSION = "v1";

function key(): string {
  return process.env.APP_PASSWORD ?? "";
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("hex");
}

/** Crée un jeton de session valable SESSION_MAX_AGE. */
export function createSessionToken(): string {
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `${VERSION}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Vérifie un jeton : version, non-expiration et signature (comparaison à temps constant). */
export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [v, expStr, sig] = parts;
  if (v !== VERSION) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const expected = sign(`${v}.${expStr}`);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vérifie un mot de passe candidat contre APP_PASSWORD (temps constant). */
export function checkPassword(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Options du cookie de session (secure uniquement en production/HTTPS). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
