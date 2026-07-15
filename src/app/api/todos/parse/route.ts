import { NextRequest, NextResponse } from "next/server";
import { parseTaches } from "@/lib/todoparse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let texte: unknown;
  try {
    ({ texte } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (typeof texte !== "string" || texte.trim().length === 0) {
    return NextResponse.json({ error: "Colle un texte à découper en tâches." }, { status: 400 });
  }

  // Date du jour côté serveur (repère temporel pour résoudre « demain », « vendredi »…).
  const now = new Date();
  const aujourdhui = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let jourSemaine = "";
  try {
    jourSemaine = new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(now);
  } catch {
    jourSemaine = "";
  }

  try {
    const taches = await parseTaches(texte, aujourdhui, jourSemaine);
    return NextResponse.json({ taches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
