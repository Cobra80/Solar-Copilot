import { NextRequest, NextResponse } from "next/server";
import { generateEmail } from "@/lib/report";
import { isDomaine } from "@/lib/domains";
import { ReportSchema } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const parsed = ReportSchema.safeParse((body as { report?: unknown })?.report);
  if (!parsed.success) {
    return NextResponse.json({ error: "Rapport manquant ou invalide." }, { status: 400 });
  }
  const domaine = (body as { domaine?: unknown })?.domaine;

  try {
    const email = await generateEmail(parsed.data, isDomaine(domaine) ? domaine : undefined);
    return NextResponse.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
