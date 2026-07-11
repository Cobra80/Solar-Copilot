import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL, toFriendlyError } from "./anthropic";
import { domainePreambule, type Domaine } from "./domains";
import { CaseDraftSchema, CaseSearchResultSchema } from "./schema";
import type { Case, CaseDraft, CaseSearchResult } from "./types";

// ---- Structuration d'une note brute en fiche de dépannage ----

const draftFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      marque: { type: "string", description: "Marque de l'équipement (Huawei, SMA, Sungrow, SolarEdge…). Chaîne vide si non précisée." },
      materiel: { type: "string", description: "Modèle / équipement concerné (ex: SUN2000-100KTL, STP 25000TL). Chaîne vide si non précisé." },
      codeErreur: { type: "string", description: "Code d'erreur tel que mentionné (ex: '206', '3501'). Chaîne vide si non codifié." },
      symptome: { type: "string", description: "Ce qui a été observé (défaut, alarme, comportement)." },
      diagnostic: { type: "string", description: "La cause identifiée. Chaîne vide si non déterminée." },
      solution: { type: "string", description: "Ce qui a résolu (ou contourné) le problème. Chaîne vide si non résolu." },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "3 à 6 mots-clés courts en minuscules pour retrouver la fiche (ex: 'isolement', 'fusible dc', 'huawei').",
      },
    },
    required: ["marque", "materiel", "codeErreur", "symptome", "diagnostic", "solution", "tags"],
    additionalProperties: false,
  },
} as const;

const STRUCTURE_SYSTEM = `Tu es un assistant pour techniciens de maintenance (O&M) en électrotechnique (photovoltaïque, postes HTA, postes HTB).
À partir d'une note brute de dépannage prise sur le terrain, tu crées une fiche structurée
pour un carnet de dépannage personnel, en français.

Règles :
- Reste STRICTEMENT fidèle à la note. N'invente ni marque, ni code, ni cause, ni solution.
- Si une information est absente, laisse le champ vide "" plutôt que de deviner.
- Reformule le jargon en phrases courtes et professionnelles, mais garde les termes
  techniques utiles à la recherche (codes, références, noms de pièces).
- Les tags sont des mots-clés courts, en minuscules, utiles pour retrouver ce cas plus tard.`;

/** Vérifie que la réponse est complète et utilisable avant d'en lire le contenu. */
function assertUsable(response: Anthropic.Message, quoi: string): void {
  if (response.stop_reason === "max_tokens") {
    throw new Error(`${quoi} a été tronqué (limite de tokens atteinte). Réessaie avec une note plus courte.`);
  }
  if (response.stop_reason === "refusal") {
    throw new Error(`Le modèle a refusé de générer ${quoi.toLowerCase()}. Reformule et réessaie.`);
  }
}

function parseTextBlocks(response: Anthropic.Message): string {
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return text;
}

/** Transforme une note brute en fiche de dépannage structurée. */
export async function structureCase(notes: string, domaine?: Domaine): Promise<CaseDraft> {
  const client = getAnthropic();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: STRUCTURE_SYSTEM + domainePreambule(domaine),
      messages: [{ role: "user", content: `Note brute de dépannage :\n\n${notes}` }],
      output_config: { format: draftFormat },
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response, "La fiche");

  const jsonText = parseTextBlocks(response);
  if (!jsonText.trim()) {
    throw new Error("Le modèle n'a pas renvoyé de fiche exploitable.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("La fiche renvoyée par le modèle est illisible. Réessaie.");
  }
  const result = CaseDraftSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("La fiche renvoyée par le modèle est incomplète. Réessaie.");
  }
  return result.data;
}

// ---- Recherche IA dans le carnet ----

const searchFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      reponse: {
        type: "string",
        description: "Réponse synthétique fondée UNIQUEMENT sur les fiches fournies : ce qui a été observé et ce qui a marché par le passé. Si aucune fiche n'est pertinente, le dire simplement.",
      },
      casIds: {
        type: "array",
        items: { type: "string" },
        description: "Ids des fiches pertinentes, de la plus pertinente à la moins pertinente. Liste vide si aucune.",
      },
    },
    required: ["reponse", "casIds"],
    additionalProperties: false,
  },
} as const;

const SEARCH_SYSTEM = `Tu aides un technicien photovoltaïque à retrouver des cas similaires dans SON carnet de dépannage personnel.

On te donne sa question et la liste de ses fiches (JSON, chacune avec un champ "id").

Règles :
- Réponds UNIQUEMENT à partir du contenu des fiches fournies. N'ajoute aucune connaissance extérieure,
  sauf pour dire explicitement qu'aucune fiche ne correspond.
- Dans "reponse" : synthétise ce que le technicien avait observé et ce qui avait résolu le problème
  (cite la marque, le code erreur, la solution). Écris en français, concret, direct.
- Dans "casIds" : uniquement des ids présents dans la liste fournie, par pertinence décroissante.
- Si aucune fiche ne correspond à la question : dis-le dans "reponse" et renvoie une liste vide.`;

// Au-delà de ce nombre de fiches, on n'envoie que les plus récentes au modèle.
// (À ce volume, la bonne évolution sera une recherche par embeddings.)
const MAX_CASES_IN_PROMPT = 300;
const FIELD_CAP = 400; // caractères max par champ dans le prompt

function compactCase(c: Case): Record<string, unknown> {
  const cap = (s: string) => (s.length > FIELD_CAP ? s.slice(0, FIELD_CAP) + "…" : s);
  return {
    id: c.id,
    date: c.createdAt.slice(0, 10),
    marque: c.marque,
    materiel: c.materiel,
    codeErreur: c.codeErreur,
    symptome: cap(c.symptome),
    diagnostic: cap(c.diagnostic),
    solution: cap(c.solution),
    tags: c.tags,
  };
}

/** Recherche en langage naturel dans les fiches du carnet. */
export async function searchCases(query: string, cases: Case[]): Promise<CaseSearchResult> {
  if (cases.length === 0) {
    return { reponse: "Le carnet est vide pour l'instant : aucune fiche à consulter.", casIds: [] };
  }
  const client = getAnthropic();

  const sorted = [...cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sample = sorted.slice(0, MAX_CASES_IN_PROMPT);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SEARCH_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `Question du technicien : ${query}\n\n` +
            `Fiches du carnet (${sample.length}${sample.length < cases.length ? ` sur ${cases.length}, les plus récentes` : ""}) :\n` +
            JSON.stringify(sample.map(compactCase)),
        },
      ],
      output_config: { format: searchFormat },
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response, "La recherche");

  const jsonText = parseTextBlocks(response);
  if (!jsonText.trim()) {
    throw new Error("Le modèle n'a pas renvoyé de résultat exploitable.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Le résultat de recherche est illisible. Réessaie.");
  }
  const result = CaseSearchResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Le résultat de recherche est incomplet. Réessaie.");
  }
  // Garde-fou : ne conserver que des ids réellement présents dans le carnet.
  const knownIds = new Set(cases.map((c) => c.id));
  return {
    reponse: result.data.reponse,
    casIds: result.data.casIds.filter((id) => knownIds.has(id)),
  };
}
