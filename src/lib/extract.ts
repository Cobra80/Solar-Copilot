import { PDFParse } from "pdf-parse";
import { extractRawText } from "mammoth";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL, toFriendlyError } from "./anthropic";
import type { DocType } from "./types";

// Extraction du texte d'un document importé (module 4).
// - PDF : pdf-parse ; si quasi vide (PDF scanné), repli sur Claude (vision).
// - DOCX : mammoth.
// - Texte (txt, md, csv, log…) : décodage direct.
// - Images (photos de procédures, plaques signalétiques) : transcription Claude.

// Plafond du texte stocké par document — au-delà on tronque (avec indicateur).
const MAX_TEXT_CHARS = 500_000;
// Taille max d'un PDF envoyé à Claude pour transcription (repli scan).
const MAX_PDF_FALLBACK_BYTES = 10 * 1024 * 1024;
const MAX_PDF_FALLBACK_PAGES = 30;

const TEXT_EXTS = new Set(["txt", "md", "csv", "log", "tsv", "json", "xml", "html"]);
const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export interface ExtractResult {
  texte: string;
  type: DocType;
  tronque: boolean;
}

function cap(texte: string): { texte: string; tronque: boolean } {
  if (texte.length <= MAX_TEXT_CHARS) return { texte, tronque: false };
  return { texte: texte.slice(0, MAX_TEXT_CHARS) + "\n[… texte tronqué …]", tronque: true };
}

function decodeText(buffer: Buffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function assertUsable(response: Anthropic.Message): void {
  if (response.stop_reason === "refusal") {
    throw new Error("Le modèle a refusé de transcrire ce document.");
  }
  // max_tokens toléré ici : une transcription partielle vaut mieux que rien,
  // le texte sera simplement marqué tronqué par le plafond de stockage.
}

function textOf(response: Anthropic.Message): string {
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return text;
}

/** Transcription d'un PDF scanné via Claude (vision). */
async function transcribePdf(buffer: Buffer): Promise<string> {
  const client = getAnthropic();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: buffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: "Transcris intégralement le texte de ce document, dans l'ordre de lecture. Conserve les titres, listes et tableaux (en texte). Ne commente pas, ne résume pas : transcris.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response);
  return textOf(response);
}

/** Transcription d'une image (photo de procédure, plaque, schéma) via Claude. */
async function transcribeImage(
  buffer: Buffer,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<string> {
  const client = getAnthropic();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: buffer.toString("base64") },
            },
            {
              type: "text",
              text: "Transcris intégralement tout le texte visible sur cette image (références, valeurs, codes inclus), puis décris brièvement son contenu technique (schéma, plaque signalétique, page de procédure…). En français.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response);
  return textOf(response);
}

/** Extrait le texte d'un fichier importé selon son type. */
export async function extractText(buffer: Buffer, filename: string): Promise<ExtractResult> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    let text = "";
    let pages = 0;
    try {
      // new Uint8Array(buffer) copie les données : pdfjs peut transférer le
      // tableau à son worker, on protège ainsi le buffer original (sauvé ensuite).
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        text = result.text ?? "";
        pages = result.total ?? 0;
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch {
      throw new Error("Impossible de lire ce PDF. Vérifie qu'il n'est pas protégé par mot de passe.");
    }
    // PDF scanné (pas de couche texte) : repli sur la transcription Claude.
    if (text.trim().length < 100) {
      if (buffer.length > MAX_PDF_FALLBACK_BYTES || pages > MAX_PDF_FALLBACK_PAGES) {
        throw new Error(
          "Ce PDF semble scanné (sans couche texte) et est trop volumineux pour être transcrit " +
            `automatiquement (max ${MAX_PDF_FALLBACK_PAGES} pages / 10 Mo). Découpe-le et réessaie.`,
        );
      }
      text = await transcribePdf(buffer);
    }
    if (!text.trim()) {
      throw new Error("Aucun texte exploitable dans ce PDF.");
    }
    return { ...cap(text), type: "pdf" };
  }

  if (ext === "docx") {
    let text: string;
    try {
      ({ value: text } = await extractRawText({ buffer }));
    } catch {
      throw new Error("Impossible de lire ce fichier Word. Formats gérés : .docx (pas .doc).");
    }
    if (!text.trim()) {
      throw new Error("Aucun texte exploitable dans ce document Word.");
    }
    return { ...cap(text), type: "docx" };
  }

  if (ext in IMAGE_TYPES) {
    const text = await transcribeImage(buffer, IMAGE_TYPES[ext]);
    if (!text.trim()) {
      throw new Error("Aucun contenu exploitable dans cette image.");
    }
    return { ...cap(text), type: "image" };
  }

  if (TEXT_EXTS.has(ext)) {
    const text = decodeText(buffer);
    if (!text.trim()) {
      throw new Error("Ce fichier texte est vide.");
    }
    return { ...cap(text), type: "texte" };
  }

  throw new Error(
    `Format « .${ext} » non pris en charge. Formats gérés : PDF, DOCX, images (JPG/PNG/WebP), texte (TXT/MD/CSV…).`,
  );
}
