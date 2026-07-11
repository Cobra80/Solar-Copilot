import { NextRequest, NextResponse } from "next/server";
import { listDocs, saveDoc, deleteDoc } from "@/lib/docstore";
import { extractText } from "@/lib/extract";
import { summarizeDoc } from "@/lib/brain";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 Mo

export async function GET() {
  try {
    const docs = await listDocs();
    return NextResponse.json({ docs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de lecture des données.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide (fichier attendu)." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (max 15 Mo)." },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { texte, type, tronque } = await extractText(buffer, file.name);
    const { resume, motsCles } = await summarizeDoc(file.name, texte);
    const doc = await saveDoc({ nom: file.name, type, buffer, texte, resume, motsCles, tronque });
    return NextResponse.json({ doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de l'import.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }
  try {
    await deleteDoc(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de suppression.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
