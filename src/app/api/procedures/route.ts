import { NextRequest, NextResponse } from "next/server";
import { listProcedures, saveProcedure, deleteProcedure } from "@/lib/procstore";
import { ProcedureSchema } from "@/lib/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const procedures = await listProcedures();
    return NextResponse.json({ procedures });
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
  const { demande, procedure, docIds } = (body ?? {}) as {
    demande?: unknown;
    procedure?: unknown;
    docIds?: unknown;
  };
  const parsed = ProcedureSchema.safeParse(procedure);
  if (!parsed.success) {
    return NextResponse.json({ error: "Procédure manquante ou invalide." }, { status: 400 });
  }

  try {
    const record = await saveProcedure({
      demande: typeof demande === "string" ? demande : "",
      procedure: parsed.data,
      docIds: Array.isArray(docIds) ? docIds.filter((d): d is string => typeof d === "string") : [],
    });
    return NextResponse.json({ record });
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
    await deleteProcedure(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de suppression.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
