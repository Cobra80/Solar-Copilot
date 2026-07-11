import { NextRequest, NextResponse } from "next/server";
import { searchCases } from "@/lib/cases";
import { listCases } from "@/lib/casestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let query: unknown;
  try {
    ({ query } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json({ error: "Merci de saisir une question." }, { status: 400 });
  }

  try {
    const cases = await listCases();
    const result = await searchCases(query, cases);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
