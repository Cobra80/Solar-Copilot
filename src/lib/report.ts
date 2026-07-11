import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL, toFriendlyError } from "./anthropic";
import { ReportSchema } from "./schema";
import type { Report } from "./types";

// Schéma JSON transmis à l'API (structured outputs).
// Contraintes Anthropic : tous les champs `required`, `additionalProperties: false`,
// pas de contrainte de longueur, pas de récursion. On évite les valeurs nullables
// (champ vide "" quand l'info est absente) pour rester compatible.
const reportFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      titre: { type: "string", description: "Titre court et clair du rapport" },
      site: { type: "string", description: "Nom / identifiant du site ou de l'installation. Chaîne vide si non précisé." },
      date: { type: "string", description: "Date de l'intervention si mentionnée (format libre). Chaîne vide sinon." },
      materiel: { type: "array", items: { type: "string" }, description: "Matériel concerné (marque, type, référence)." },
      constat: { type: "string", description: "Constat / diagnostic : ce qui a été observé, le défaut, le contexte." },
      actionsRealisees: { type: "array", items: { type: "string" }, description: "Actions réalisées pendant l'intervention." },
      piecesRemplacees: { type: "array", items: { type: "string" }, description: "Pièces remplacées, si applicable." },
      recommandations: { type: "array", items: { type: "string" }, description: "Recommandations et suivi conseillé." },
      statut: {
        type: "string",
        enum: ["résolu", "à suivre", "en attente de pièces", "non résolu"],
        description: "Statut final de l'intervention.",
      },
      productionRetablie: {
        type: "string",
        enum: ["oui", "non", "inconnu"],
        description: "La production a-t-elle été rétablie ?",
      },
    },
    required: [
      "titre",
      "site",
      "date",
      "materiel",
      "constat",
      "actionsRealisees",
      "piecesRemplacees",
      "recommandations",
      "statut",
      "productionRetablie",
    ],
    additionalProperties: false,
  },
} as const;

const REPORT_SYSTEM = `Tu es un assistant pour techniciens de maintenance (O&M) photovoltaïque.
À partir de notes brutes prises sur le terrain, tu produis un rapport d'intervention structuré, clair et professionnel, en français.

Règles :
- Reste STRICTEMENT fidèle aux informations fournies. N'invente aucun fait, aucune marque, aucune référence, aucune mesure.
- Si une information est absente, laisse le champ vide (chaîne "" ou liste []) plutôt que de deviner.
- Reformule proprement le jargon et les abréviations de terrain en phrases professionnelles.
- Les éléments de liste doivent être courts, concrets et exploitables.
- Déduis le statut et l'état de la production uniquement à partir des indices présents dans les notes ; sinon "non résolu" / "inconnu".`;

const EMAIL_SYSTEM = `Tu rédiges des emails clients professionnels, clairs et concis, en français,
pour une société de maintenance photovoltaïque, à partir d'un rapport d'intervention structuré.

Consignes :
- Ton courtois, rassurant, sans jargon inutile.
- Structure : Objet (ligne "Objet : ..."), formule d'appel, corps (constat, actions réalisées, statut, recommandations éventuelles), formule de politesse et signature générique.
- Ne mentionne QUE les informations présentes dans le rapport. N'invente rien.`;

/** Vérifie que la réponse est complète et utilisable avant d'en lire le contenu. */
function assertUsable(response: Anthropic.Message, quoi: string): void {
  if (response.stop_reason === "max_tokens") {
    throw new Error(`${quoi} a été tronqué (limite de tokens atteinte). Réessaie avec des notes plus courtes.`);
  }
  if (response.stop_reason === "refusal") {
    throw new Error(`Le modèle a refusé de générer ${quoi.toLowerCase()}. Reformule les notes et réessaie.`);
  }
}

/** Génère un rapport structuré à partir des notes de terrain. */
export async function generateReport(notes: string): Promise<Report> {
  const client = getAnthropic();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: REPORT_SYSTEM,
      messages: [{ role: "user", content: `Notes brutes de terrain :\n\n${notes}` }],
      output_config: { format: reportFormat },
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response, "Le rapport");

  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") jsonText += block.text;
  }
  if (!jsonText.trim()) {
    throw new Error("Le modèle n'a pas renvoyé de rapport exploitable.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Le rapport renvoyé par le modèle est illisible. Réessaie.");
  }
  const result = ReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Le rapport renvoyé par le modèle est incomplet. Réessaie.");
  }
  return result.data;
}

/** Génère un brouillon d'email client à partir d'un rapport. */
export async function generateEmail(report: Report): Promise<string> {
  const client = getAnthropic();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: EMAIL_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            "Voici le rapport d'intervention (JSON). Rédige l'email client correspondant :\n\n" +
            JSON.stringify(report, null, 2),
        },
      ],
    });
  } catch (err) {
    throw toFriendlyError(err);
  }
  assertUsable(response, "L'email");

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  if (!text.trim()) {
    throw new Error("Le modèle n'a pas renvoyé d'email exploitable.");
  }
  return text.trim();
}
