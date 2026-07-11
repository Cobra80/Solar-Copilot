import { NextRequest, NextResponse } from "next/server";
import { analyzeLogFile } from "@/lib/loganalysis";

export const runtime = "nodejs";

// Garde-fou sur la taille d'entrée (avant échantillonnage) : au-delà,
// on demande à l'utilisateur de découper plutôt que d'analyser à l'aveugle.
const MAX_INPUT_CHARS = 5_000_000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const { content, filename } = (body ?? {}) as { content?: unknown; filename?: unknown };

  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "Aucun contenu à analyser. Charge un fichier ou colle des logs." },
      { status: 400 },
    );
  }
  if (content.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (> 5 Mo de texte). Découpe-le par période et réessaie." },
      { status: 413 },
    );
  }

  try {
    const { analysis, truncated } = await analyzeLogFile(
      content,
      typeof filename === "string" ? filename : undefined,
    );
    return NextResponse.json({ analysis, truncated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
