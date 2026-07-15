import { NextRequest, NextResponse } from "next/server";
import { listTaches, addTache, updateTache, deleteTache } from "@/lib/todostore";
import { TacheDraftSchema, TachePatchSchema } from "@/lib/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const taches = await listTaches();
    return NextResponse.json({ taches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de lecture des données.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  // Normalise (echeance/note optionnelles côté client).
  const parsed = TacheDraftSchema.safeParse({
    titre: typeof raw.titre === "string" ? raw.titre.trim() : "",
    echeance: typeof raw.echeance === "string" ? raw.echeance : "",
    note: typeof raw.note === "string" ? raw.note : "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Intitulé de tâche manquant." }, { status: 400 });
  }

  try {
    const tache = await addTache(parsed.data);
    return NextResponse.json({ tache });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur d'enregistrement.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const { id, patch } = (body ?? {}) as { id?: unknown; patch?: unknown };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }
  const parsed = TachePatchSchema.safeParse(patch);
  if (!parsed.success) {
    return NextResponse.json({ error: "Modification invalide." }, { status: 400 });
  }

  try {
    const tache = await updateTache(id, parsed.data);
    if (!tache) return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
    return NextResponse.json({ tache });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de mise à jour.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }
  try {
    await deleteTache(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de suppression.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
