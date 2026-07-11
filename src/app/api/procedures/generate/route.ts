import { NextRequest, NextResponse } from "next/server";
import { generateProcedure } from "@/lib/procedures";
import { listDocEntries } from "@/lib/docstore";
import { listCases } from "@/lib/casestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let demande: unknown;
  try {
    ({ demande } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (typeof demande !== "string" || demande.trim().length === 0) {
    return NextResponse.json({ error: "Merci de décrire la tâche." }, { status: 400 });
  }

  try {
    const [docs, cases] = await Promise.all([listDocEntries(), listCases()]);
    const result = await generateProcedure(demande, docs, cases);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
