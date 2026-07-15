import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL, toFriendlyError } from "./anthropic";
import { TachesParseSchema } from "./schema";
import type { TacheDraft } from "./types";

// Découpe un pavé de notes/instructions en tâches structurées (module 6).
// Résout les échéances exprimées en langage naturel ("aujourd'hui", "demain",
// "vendredi") par rapport à la date du jour fournie par l'appelant.

const parseFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      taches: {
        type: "array",
        description: "Les tâches extraites du texte, une par action distincte.",
        items: {
          type: "object",
          properties: {
            titre: {
              type: "string",
              description: "Intitulé court et actionnable, à l'impératif (ex: 'Rappeler Transfo Lab pour les analyses d'huile Hypercourt').",
            },
            echeance: {
              type: "string",
              description: "Date au format YYYY-MM-DD si une échéance est mentionnée ou déductible, sinon chaîne vide.",
            },
            note: {
              type: "string",
              description: "Contexte utile : personnes, site, dépendances, ce qui suit la tâche. Chaîne vide si rien.",
            },
          },
          required: ["titre", "echeance", "note"],
          additionalProperties: false,
        },
      },
    },
    required: ["taches"],
    additionalProperties: false,
  },
} as const;

/**
 * @param texte  Le pavé brut (ce que le responsable a demandé, en vrac).
 * @param aujourdhui  Date du jour "YYYY-MM-DD".
 * @param jourSemaine  Jour de la semaine en français (ex: "mercredi").
 */
export async function parseTaches(
  texte: string,
  aujourdhui: string,
  jourSemaine: string,
): Promise<TacheDraft[]> {
  const client = getAnthropic();

  const system = `Tu transformes un pavé de notes/instructions de terrain en une liste de tâches structurées, en français.

Repère du temps : aujourd'hui est ${jourSemaine} ${aujourdhui} (format YYYY-MM-DD).

Règles :
- Découpe en tâches DISTINCTES : une instruction qui contient plusieurs actions donne plusieurs tâches.
- "titre" : court, à l'impératif, avec le site/la personne clé s'ils sont cités.
- "echeance" : résous les repères temporels par rapport à aujourd'hui — "aujourd'hui" = ${aujourdhui} ; "demain" = le lendemain ; un jour de la semaine ("vendredi") = sa prochaine occurrence à venir (aujourd'hui compris s'il correspond). Si aucune date n'est mentionnée ni déductible, mets "".
- "note" : mets le contexte utile (personnes, dépendances du type "une fois X fait, envoyer à Y", précisions). "" si rien.
- N'invente pas de tâches. Ne perds aucune tâche mentionnée.`;

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: `Pavé à découper en tâches :\n\n${texte}` }],
      output_config: { format: parseFormat },
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Trop de texte d'un coup : le découpage a été tronqué. Réessaie avec moins de texte.");
  }
  if (response.stop_reason === "refusal") {
    throw new Error("Le modèle a refusé de traiter ce texte. Reformule et réessaie.");
  }

  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") jsonText += block.text;
  }
  if (!jsonText.trim()) throw new Error("Le modèle n'a pas renvoyé de tâches exploitables.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Le découpage renvoyé est illisible. Réessaie.");
  }
  const result = TachesParseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Le découpage renvoyé est incomplet. Réessaie.");
  }
  return result.data.taches;
}
