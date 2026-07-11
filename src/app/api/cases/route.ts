import { NextRequest, NextResponse } from "next/server";
import { listCases, saveCase, deleteCase } from "@/lib/casestore";
import { CaseDraftSchema } from "@/lib/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cases = await listCases();
    return NextResponse.json({ cases });
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
  const parsed = CaseDraftSchema.safeParse((body as { draft?: unknown })?.draft);
  if (!parsed.success) {
    return NextResponse.json({ error: "Fiche manquante ou invalide." }, { status: 400 });
  }

  try {
    const savedCase = await saveCase(parsed.data);
    return NextResponse.json({ case: savedCase });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur d'enregistrement.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }
  try {
    await deleteCase(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de suppression.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
