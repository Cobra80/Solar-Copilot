import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { createJsonStore } from "./jsonstore";
import { DOCS_DIR } from "./paths";
import type { DocEntry, DocMeta, DocType } from "./types";

// Persistance des documents du second cerveau (module 4).
// - Index (métadonnées + texte extrait) : data/documents.json via le store générique.
// - Fichiers originaux conservés dans data/docs/<id>.<ext> (re-traitement futur,
//   téléchargement). Le nom stocké est dérivé de l'id (UUID) : aucun risque de
//   traversée de chemin lié au nom de fichier d'origine.

const store = createJsonStore<DocEntry>("documents.json");

function toMeta(entry: DocEntry): DocMeta {
  const { texte: _texte, ...meta } = entry;
  void _texte;
  return meta;
}

/** Liste les métadonnées (sans texte), du plus récent au plus ancien. */
export async function listDocs(): Promise<DocMeta[]> {
  const items = await store.list();
  return items
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toMeta);
}

/** Liste les documents complets (avec texte), du plus récent au plus ancien. */
export async function listDocEntries(): Promise<DocEntry[]> {
  const items = await store.list();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Enregistre un document (fichier original + entrée d'index) et renvoie ses métadonnées. */
export async function saveDoc(input: {
  nom: string;
  type: DocType;
  buffer: Buffer;
  texte: string;
  resume: string;
  motsCles: string[];
  tronque: boolean;
}): Promise<DocMeta> {
  const id = randomUUID();
  // Extension sûre : dérivée du nom d'origine, filtrée en alphanumérique.
  const rawExt = path.extname(input.nom).slice(1).toLowerCase();
  const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : "bin";

  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.writeFile(path.join(DOCS_DIR, `${id}.${ext}`), input.buffer);

  const entry: DocEntry = {
    id,
    createdAt: new Date().toISOString(),
    nom: input.nom,
    type: input.type,
    taille: input.buffer.length,
    resume: input.resume,
    motsCles: input.motsCles,
    caracteres: input.texte.length,
    tronque: input.tronque,
    texte: input.texte,
  };
  await store.add(entry);
  return toMeta(entry);
}

/** Supprime un document (index + fichier original). */
export async function deleteDoc(id: string): Promise<void> {
  await store.remove(id);
  // Supprime le fichier original quel que soit son extension.
  try {
    const files = await fs.readdir(DOCS_DIR);
    await Promise.all(
      files
        .filter((f) => f.startsWith(`${id}.`))
        .map((f) => fs.unlink(path.join(DOCS_DIR, f)).catch(() => {})),
    );
  } catch {
    /* dossier absent : rien à faire */
  }
}
