import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL, toFriendlyError } from "./anthropic";
import { buildContextParts, gatherContext } from "./brain";
import { GeneratedProcedureSchema } from "./schema";
import type { Case, DocEntry, Procedure } from "./types";

// Générateur de procédures (module 5).
// La génération s'appuie en priorité sur la bibliothèque de l'utilisateur
// (documents du cerveau + carnet de dépannage) via gatherContext(), et complète
// avec les bonnes pratiques générales du métier quand les documents ne couvrent
// pas le sujet. Les sources réellement utilisées sont renvoyées (docIds).

const procedureFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      titre: { type: "string", description: "Titre de la procédure." },
      objectif: { type: "string", description: "Ce que la procédure permet d'accomplir, en 1-2 phrases." },
      dureeEstimee: { type: "string", description: "Durée indicative (ex: '1h30 à 2h'). Chaîne vide si non estimable." },
      personnel: { type: "string", description: "Personnel requis et habilitations usuelles (ex: '1 technicien habilité BP/BR'). Chaîne vide si non applicable." },
      epi: { type: "array", items: { type: "string" }, description: "Équipements de protection individuelle requis." },
      risques: { type: "array", items: { type: "string" }, description: "Risques identifiés et points de vigilance." },
      materiel: { type: "array", items: { type: "string" }, description: "Outillage, appareils de mesure et pièces nécessaires." },
      etapes: {
        type: "array",
        description: "Étapes dans l'ordre réel d'exécution, sécurité/consignation en premier.",
        items: {
          type: "object",
          properties: {
            titre: { type: "string", description: "Titre court de l'étape." },
            details: { type: "array", items: { type: "string" }, description: "Instructions concrètes de l'étape." },
            attention: { type: "string", description: "Avertissement spécifique à cette étape. Chaîne vide si aucun." },
          },
          required: ["titre", "details", "attention"],
          additionalProperties: false,
        },
      },
      controlesFinaux: {
        type: "array",
        items: { type: "string" },
        description: "Vérifications à faire avant de quitter le site (mesures, monitoring, traçabilité).",
      },
      avertissement: {
        type: "string",
        description: "Rappel que la procédure doit être validée selon les consignes de l'entreprise et la notice constructeur.",
      },
      docIds: {
        type: "array",
        items: { type: "string" },
        description: "Ids des documents fournis réellement utilisés pour rédiger la procédure. Liste vide si aucun.",
      },
    },
    required: [
      "titre",
      "objectif",
      "dureeEstimee",
      "personnel",
      "epi",
      "risques",
      "materiel",
      "etapes",
      "controlesFinaux",
      "avertissement",
      "docIds",
    ],
    additionalProperties: false,
  },
} as const;

const PROCEDURE_SYSTEM = `Tu es un expert en maintenance photovoltaïque et en sécurité électrique.
Tu rédiges des procédures d'intervention opérationnelles pour des techniciens de terrain, en français.

On peut te fournir des documents de la bibliothèque personnelle du technicien (notices constructeur,
procédures internes, carnet de dépannage). Règles :
- Si des documents fournis couvrent le sujet, appuie-toi dessus EN PRIORITÉ et liste leurs ids dans docIds.
- Les valeurs précises (couples de serrage, références de pièces, seuils, réglages) doivent venir des
  documents fournis — ne les invente JAMAIS. Si une valeur précise manque, écris « voir notice constructeur ».
- Complète avec les bonnes pratiques générales du métier quand les documents ne suffisent pas
  (docIds vide si aucun document utilisé).
- La sécurité d'abord : consignation (AC puis DC, condamnation), attente de décharge, VAT,
  EPI adaptés au risque électrique et au contexte (toiture, nacelle…), habilitations usuelles.
  Sois exhaustif sur les risques.
- Étapes concrètes et actionnables, dans l'ordre réel d'exécution : sécurité → dépose → pose →
  remise en service → contrôles.
- Termine par un avertissement rappelant que la procédure doit être validée selon les consignes
  de l'entreprise et la notice du constructeur.`;

function assertUsable(response: Anthropic.Message): void {
  if (response.stop_reason === "max_tokens") {
    throw new Error("La procédure a été tronquée (limite de tokens atteinte). Réessaie avec une demande plus ciblée.");
  }
  if (response.stop_reason === "refusal") {
    throw new Error("Le modèle a refusé de générer cette procédure. Reformule la demande.");
  }
}

/** Génère une procédure d'intervention, fondée sur la bibliothèque quand elle couvre le sujet. */
export async function generateProcedure(
  demande: string,
  docs: DocEntry[],
  cases: Case[],
): Promise<{ procedure: Procedure; docIds: string[] }> {
  const client = getAnthropic();

  const selected = await gatherContext(demande, docs, cases);
  const { parts, used } = buildContextParts(selected);

  const content =
    parts.length > 0
      ? `Tâche : ${demande}\n\nDocuments de la bibliothèque du technicien :\n\n${parts.join("\n\n")}`
      : `Tâche : ${demande}\n\n(Aucun document de bibliothèque disponible : appuie-toi sur les bonnes pratiques générales.)`;

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: PROCEDURE_SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { format: procedureFormat },
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response);

  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") jsonText += block.text;
  }
  if (!jsonText.trim()) {
    throw new Error("Le modèle n'a pas renvoyé de procédure exploitable.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("La procédure renvoyée par le modèle est illisible. Réessaie.");
  }
  const result = GeneratedProcedureSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("La procédure renvoyée par le modèle est incomplète. Réessaie.");
  }

  const { docIds, ...procedure } = result.data;
  // Garde-fou : ne conserver que des ids réellement envoyés au modèle.
  const sentIds = new Set(used.map((d) => d.id));
  return { procedure, docIds: docIds.filter((id) => sentIds.has(id)) };
}
