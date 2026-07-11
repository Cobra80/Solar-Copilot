import { NextRequest, NextResponse } from "next/server";
import {
  listInterventions,
  saveIntervention,
  deleteIntervention,
} from "@/lib/store";
import { ReportSchema } from "@/lib/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const interventions = await listInterventions();
    return NextResponse.json({ interventions });
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
  const { notes, report } = (body ?? {}) as { notes?: unknown; report?: unknown };
  const parsed = ReportSchema.safeParse(report);
  if (!parsed.success) {
    return NextResponse.json({ error: "Rapport manquant ou invalide." }, { status: 400 });
  }

  try {
    const intervention = await saveIntervention({
      notes: typeof notes === "string" ? notes : "",
      report: parsed.data,
    });
    return NextResponse.json({ intervention });
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
    await deleteIntervention(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de suppression.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
