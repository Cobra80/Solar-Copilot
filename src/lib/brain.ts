import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL, toFriendlyError } from "./anthropic";
import { DocAnswerSchema, DocSelectionSchema, DocSummarySchema } from "./schema";
import type { Case, DocAnswer, DocEntry } from "./types";

// Second cerveau (module 4) : résumé des documents à l'import, puis réponse
// aux questions en deux étapes :
//   1. sélection des documents pertinents à partir des résumés (rapide, léger) ;
//   2. réponse fondée sur le texte complet des documents retenus.
// Le carnet de dépannage (module 3) est injecté comme pseudo-document (id "carnet"),
// il traverse les deux étapes comme n'importe quel document.
// Quand la bibliothèque est petite, l'étape 1 est sautée (tout part en contexte).
// À grande échelle (> quelques centaines de docs), la bonne évolution sera une
// recherche par embeddings — hors périmètre pour un usage perso.

const summaryFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      resume: { type: "string", description: "Résumé du document en 2 à 4 phrases : de quoi il parle, à quoi il sert." },
      motsCles: { type: "array", items: { type: "string" }, description: "4 à 8 mots-clés courts en minuscules (marques, modèles, thèmes, types de défauts…)." },
    },
    required: ["resume", "motsCles"],
    additionalProperties: false,
  },
} as const;

const selectionFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      docIds: {
        type: "array",
        items: { type: "string" },
        description: "Ids des documents pertinents pour répondre, par pertinence décroissante. Liste vide si aucun.",
      },
    },
    required: ["docIds"],
    additionalProperties: false,
  },
} as const;

const answerFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      reponse: {
        type: "string",
        description: "Réponse en français, fondée UNIQUEMENT sur les documents fournis, citant le nom des documents utilisés. Si les documents ne permettent pas de répondre, le dire clairement.",
      },
      docIds: {
        type: "array",
        items: { type: "string" },
        description: "Ids des documents réellement utilisés pour la réponse. Liste vide si aucun.",
      },
    },
    required: ["reponse", "docIds"],
    additionalProperties: false,
  },
} as const;

const ANSWER_SYSTEM = `Tu es l'assistant documentaire personnel d'un technicien de maintenance photovoltaïque.
On te donne sa question et le contenu de documents de SA bibliothèque (procédures, notices, rapports…).
La bibliothèque peut inclure son « Carnet de dépannage » : ses fiches d'interventions passées
(marque, code erreur, symptôme, diagnostic, solution) — traite-le comme un document à part entière.

Règles :
- Réponds UNIQUEMENT à partir des documents fournis. N'utilise aucune connaissance extérieure,
  sauf pour dire explicitement que les documents ne permettent pas de répondre.
- Cite le nom du document quand tu t'appuies dessus (ex : « d'après “notice-sun2000.pdf”… »,
  « d'après ton carnet de dépannage… »).
- Structure la réponse pour un technicien : étapes numérotées si c'est une procédure,
  valeurs et références exactes telles qu'écrites dans les documents.
- Si plusieurs documents se contredisent, signale-le.
- Sécurité : si la procédure comporte des consignes de sécurité (consignation, EPI…),
  reprends-les fidèlement — ne les invente pas, ne les omets pas.`;

function assertUsable(response: Anthropic.Message, quoi: string): void {
  if (response.stop_reason === "max_tokens") {
    throw new Error(`${quoi} a été tronqué (limite de tokens atteinte). Réessaie.`);
  }
  if (response.stop_reason === "refusal") {
    throw new Error(`Le modèle a refusé de traiter cette demande.`);
  }
}

function textOf(response: Anthropic.Message): string {
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return text;
}

function parseJson<T>(jsonText: string, parse: (v: unknown) => T | null, quoi: string): T {
  if (!jsonText.trim()) throw new Error(`Le modèle n'a pas renvoyé ${quoi}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`${quoi} renvoyé par le modèle est illisible. Réessaie.`);
  }
  const result = parse(parsed);
  if (result === null) throw new Error(`${quoi} renvoyé par le modèle est incomplet. Réessaie.`);
  return result;
}

/** Résume un document à l'import (résumé + mots-clés pour la sélection future). */
export async function summarizeDoc(
  nom: string,
  texte: string,
): Promise<{ resume: string; motsCles: string[] }> {
  const client = getAnthropic();
  const excerpt = texte.length > 100_000 ? texte.slice(0, 100_000) + "\n[…]" : texte;

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system:
        "Tu résumes des documents techniques (photovoltaïque, électricité, maintenance) pour indexer une bibliothèque personnelle. Fidèle au contenu, sans invention. En français.",
      messages: [{ role: "user", content: `Document « ${nom} » :\n\n${excerpt}` }],
      output_config: { format: summaryFormat },
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response, "Le résumé");

  return parseJson(
    textOf(response),
    (v) => {
      const r = DocSummarySchema.safeParse(v);
      return r.success ? r.data : null;
    },
    "Le résumé",
  );
}

// Seuil en-dessous duquel on envoie tous les documents sans étape de sélection.
const DIRECT_CONTEXT_CHARS = 80_000;
// Budget total de texte envoyé pour la réponse, et plafond par document.
const MAX_CONTEXT_CHARS = 250_000;
const MAX_PER_DOC_CHARS = 120_000;

// ---- Carnet de dépannage comme source du cerveau ----

/** Id réservé du pseudo-document « Carnet de dépannage » (jamais persisté). */
export const CARNET_DOC_ID = "carnet";

const MAX_CASES_IN_BRAIN = 300;
const CASE_FIELD_CAP = 400;

/** Représente le carnet comme un document virtuel interrogeable par le cerveau. */
function carnetToDoc(cases: Case[]): DocEntry {
  const cap = (s: string) => (s.length > CASE_FIELD_CAP ? s.slice(0, CASE_FIELD_CAP) + "…" : s);
  const sorted = [...cases]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_CASES_IN_BRAIN);

  const texte = sorted
    .map((c) =>
      [
        `--- Fiche du ${c.createdAt.slice(0, 10)} ---`,
        [
          c.marque && `Marque : ${c.marque}`,
          c.materiel && `Matériel : ${c.materiel}`,
          c.codeErreur && `Code erreur : ${c.codeErreur}`,
        ]
          .filter(Boolean)
          .join(" | "),
        c.symptome && `Symptôme : ${cap(c.symptome)}`,
        c.diagnostic && `Diagnostic : ${cap(c.diagnostic)}`,
        c.solution && `Solution : ${cap(c.solution)}`,
        c.tags.length > 0 && `Tags : ${c.tags.join(", ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  // Marques et codes comme mots-clés : fort signal pour l'étape de sélection.
  const motsCles = [
    ...new Set(
      sorted.flatMap((c) => [c.marque.toLowerCase(), c.codeErreur].filter(Boolean)),
    ),
  ].slice(0, 15);

  return {
    id: CARNET_DOC_ID,
    createdAt: new Date().toISOString(),
    nom: "Carnet de dépannage",
    type: "texte",
    taille: texte.length,
    resume: `Fiches de dépannage personnelles du technicien (${sorted.length} fiches) : pannes rencontrées avec marque, code erreur, symptôme, diagnostic et solution appliquée.`,
    motsCles,
    caracteres: texte.length,
    tronque: cases.length > MAX_CASES_IN_BRAIN,
    texte,
  };
}

/** Étape 1 : sélectionne les documents pertinents à partir des résumés. */
async function selectDocs(question: string, docs: DocEntry[]): Promise<DocEntry[]> {
  const client = getAnthropic();
  const catalogue = docs.map((d) => ({
    id: d.id,
    nom: d.nom,
    type: d.type,
    resume: d.resume,
    motsCles: d.motsCles,
  }));

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system:
        "Tu sélectionnes, dans le catalogue d'une bibliothèque personnelle, les documents utiles pour répondre à une question. Choisis large en cas de doute (mieux vaut un document de trop qu'un manquant), mais ne retiens pas les documents sans rapport.",
      messages: [
        {
          role: "user",
          content: `Question : ${question}\n\nCatalogue :\n${JSON.stringify(catalogue)}`,
        },
      ],
      output_config: { format: selectionFormat },
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response, "La sélection");

  const { docIds } = parseJson(
    textOf(response),
    (v) => {
      const r = DocSelectionSchema.safeParse(v);
      return r.success ? r.data : null;
    },
    "La sélection",
  );
  const byId = new Map(docs.map((d) => [d.id, d]));
  return docIds.map((id) => byId.get(id)).filter((d): d is DocEntry => Boolean(d));
}

/**
 * Rassemble le contexte documentaire pertinent pour une demande :
 * documents + carnet (pseudo-document), avec sélection par résumés si la
 * bibliothèque est trop grosse pour partir entière en contexte.
 * Partagé entre le cerveau (réponse aux questions) et le générateur de procédures.
 */
export async function gatherContext(
  question: string,
  docs: DocEntry[],
  cases: Case[] = [],
): Promise<DocEntry[]> {
  const allDocs = cases.length > 0 ? [...docs, carnetToDoc(cases)] : docs;
  if (allDocs.length === 0) return [];
  const totalChars = allDocs.reduce((sum, d) => sum + d.texte.length, 0);
  if (totalChars <= DIRECT_CONTEXT_CHARS) return allDocs;
  return selectDocs(question, allDocs);
}

/** Sérialise les documents retenus dans le budget de contexte. */
export function buildContextParts(selected: DocEntry[]): {
  parts: string[];
  used: DocEntry[];
} {
  const parts: string[] = [];
  let budget = MAX_CONTEXT_CHARS;
  const used: DocEntry[] = [];
  for (const doc of selected) {
    if (budget <= 0) break;
    const slice = doc.texte.slice(0, Math.min(MAX_PER_DOC_CHARS, budget));
    parts.push(`===== DOCUMENT id=${doc.id} nom=${doc.nom} =====\n${slice}`);
    budget -= slice.length;
    used.push(doc);
  }
  return { parts, used };
}

/** Répond à une question à partir de la bibliothèque documentaire (+ carnet de dépannage). */
export async function askDocs(
  question: string,
  docs: DocEntry[],
  cases: Case[] = [],
): Promise<DocAnswer> {
  if (docs.length === 0 && cases.length === 0) {
    return {
      reponse:
        "La bibliothèque est vide pour l'instant : ajoute des documents (PDF, Word, photos…) ou des fiches dans le carnet pour pouvoir les interroger.",
      docIds: [],
    };
  }
  const client = getAnthropic();

  const selected = await gatherContext(question, docs, cases);
  if (selected.length === 0) {
    return {
      reponse: "Aucun document de la bibliothèque ne semble concerner cette question.",
      docIds: [],
    };
  }

  // Réponse sur le texte des documents retenus, dans le budget de contexte.
  const { parts, used } = buildContextParts(selected);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: ANSWER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Question : ${question}\n\n${parts.join("\n\n")}`,
        },
      ],
      output_config: { format: answerFormat },
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response, "La réponse");

  const answer = parseJson(
    textOf(response),
    (v) => {
      const r = DocAnswerSchema.safeParse(v);
      return r.success ? r.data : null;
    },
    "La réponse",
  );
  // Garde-fou : ne conserver que des ids réellement envoyés au modèle.
  const sentIds = new Set(used.map((d) => d.id));
  return { reponse: answer.reponse, docIds: answer.docIds.filter((id) => sentIds.has(id)) };
}
