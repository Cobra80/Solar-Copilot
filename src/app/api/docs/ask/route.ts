import { NextRequest, NextResponse } from "next/server";
import { askDocs } from "@/lib/brain";
import { listDocEntries } from "@/lib/docstore";
import { listCases } from "@/lib/casestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let question: unknown;
  try {
    ({ question } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "Merci de saisir une question." }, { status: 400 });
  }

  try {
    const [docs, cases] = await Promise.all([listDocEntries(), listCases()]);
    const result = await askDocs(question, docs, cases);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
