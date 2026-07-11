import { NextRequest, NextResponse } from "next/server";
import { structureCase } from "@/lib/cases";
import { isDomaine } from "@/lib/domains";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { notes?: unknown; domaine?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const { notes, domaine } = body;
  if (typeof notes !== "string" || notes.trim().length === 0) {
    return NextResponse.json(
      { error: "Merci de saisir une note de dépannage." },
      { status: 400 },
    );
  }

  try {
    const draft = await structureCase(notes, isDomaine(domaine) ? domaine : undefined);
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
