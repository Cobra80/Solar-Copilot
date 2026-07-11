import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL, toFriendlyError } from "./anthropic";
import { LogAnalysisSchema } from "./schema";
import type { LogAnalysis } from "./types";

// Schéma JSON transmis à l'API (structured outputs) — mêmes contraintes que
// pour le rapport : tout `required`, `additionalProperties: false`.
const analysisFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      resume: {
        type: "string",
        description: "Résumé synthétique de l'état du parc sur la période (4-8 phrases).",
      },
      periode: {
        type: "string",
        description: "Période couverte par les logs si identifiable (ex: '01/06 au 15/06/2026'). Chaîne vide sinon.",
      },
      equipements: {
        type: "array",
        items: { type: "string" },
        description: "Équipements identifiés dans les logs (marque, modèle, n° d'onduleur…).",
      },
      santeGlobale: {
        type: "string",
        enum: ["bon", "à surveiller", "dégradé", "critique"],
        description: "État de santé global déduit des logs.",
      },
      erreurs: {
        type: "array",
        description: "Erreurs regroupées par code/type, triées de la plus préoccupante à la moins préoccupante.",
        items: {
          type: "object",
          properties: {
            code: { type: "string", description: "Code d'erreur tel qu'il apparaît dans les logs. Chaîne vide si non codifié." },
            libelle: { type: "string", description: "Libellé court de l'erreur." },
            occurrences: { type: "integer", description: "Nombre d'occurrences dans l'extrait fourni." },
            gravite: { type: "string", enum: ["critique", "majeure", "mineure", "info"] },
            description: { type: "string", description: "Ce que signifie cette erreur et son contexte dans ces logs (horaires, équipements touchés…)." },
            actionRecommandee: { type: "string", description: "Action concrète recommandée au technicien." },
          },
          required: ["code", "libelle", "occurrences", "gravite", "description", "actionRecommandee"],
          additionalProperties: false,
        },
      },
      anomalies: {
        type: "array",
        description: "Motifs suspects au-delà des erreurs unitaires (récurrences horaires, pertes de comm, derating, redémarrages en boucle…).",
        items: {
          type: "object",
          properties: {
            titre: { type: "string" },
            description: { type: "string" },
            gravite: { type: "string", enum: ["critique", "majeure", "mineure", "info"] },
          },
          required: ["titre", "description", "gravite"],
          additionalProperties: false,
        },
      },
      recommandations: {
        type: "array",
        items: { type: "string" },
        description: "Recommandations d'intervention priorisées pour le technicien.",
      },
    },
    required: [
      "resume",
      "periode",
      "equipements",
      "santeGlobale",
      "erreurs",
      "anomalies",
      "recommandations",
    ],
    additionalProperties: false,
  },
} as const;

const ANALYSIS_SYSTEM = `Tu es un expert en maintenance (O&M) photovoltaïque, spécialiste de l'analyse des journaux d'onduleurs (SMA, Huawei, Sungrow, SolarEdge, Fronius…).

À partir d'un extrait de logs (CSV ou texte, tout format constructeur), tu produis une analyse structurée en français :
- Regroupe les erreurs par code/type et compte leurs occurrences réelles dans l'extrait.
- Estime la gravité de chaque erreur pour l'exploitation (perte de production, risque matériel, sécurité).
- Repère les anomalies et motifs suspects : défauts récurrents à certaines heures (ex. défaut d'isolement au petit matin = humidité/condensation), pertes de communication, derating thermique l'après-midi, redémarrages en boucle, chutes de production inexpliquées.
- Donne des recommandations concrètes, priorisées et actionnables pour un technicien de terrain.

Règles :
- Reste STRICTEMENT fidèle aux données. N'invente ni codes, ni équipements, ni chiffres, ni dates.
- Si une information est absente ou indéterminable, utilise une chaîne vide "" ou une liste [].
- Si les logs semblent sains, dis-le simplement : ne fabrique pas de problèmes.
- Écris pour un technicien : précis, concret, sans blabla.`;

// Au-delà de cette taille, on filtre : début + fin + toutes les lignes
// évoquant une erreur/alarme. Maîtrise le coût API sans perdre l'essentiel.
const MAX_CHARS = 300_000;
const KEYWORD_RE =
  /err|fault|alarm|warn|fail|critical|trip|defaut|défaut|erreur|alarme|isol|derat|disturb|ground|leak|riso|offline|lost|interrupt|stop|abnormal/i;

export function prepareLogContent(raw: string): { content: string; truncated: boolean } {
  if (raw.length <= MAX_CHARS) return { content: raw, truncated: false };

  const lines = raw.split(/\r?\n/);
  const head = lines.slice(0, 150);
  const tail = lines.length > 300 ? lines.slice(-150) : [];
  const middle = lines.slice(150, Math.max(150, lines.length - 150)).filter((l) => KEYWORD_RE.test(l));

  let content = [
    ...head,
    `[… fichier volumineux : sur les ${lines.length - head.length - tail.length} lignes suivantes, seules celles évoquant une erreur/alarme sont conservées …]`,
    ...middle,
    "[… fin de l'extrait filtré …]",
    ...tail,
  ].join("\n");

  if (content.length > MAX_CHARS) {
    content = content.slice(0, MAX_CHARS) + "\n[… tronqué …]";
  }
  return { content, truncated: true };
}

/** Vérifie que la réponse est complète et utilisable avant d'en lire le contenu. */
function assertUsable(response: Anthropic.Message): void {
  if (response.stop_reason === "max_tokens") {
    throw new Error("L'analyse a été tronquée (limite de tokens atteinte). Réessaie avec un fichier plus court.");
  }
  if (response.stop_reason === "refusal") {
    throw new Error("Le modèle a refusé d'analyser ce contenu. Vérifie le fichier et réessaie.");
  }
}

/** Analyse un extrait de logs d'onduleur et renvoie une synthèse structurée. */
export async function analyzeLogFile(
  raw: string,
  filename?: string,
): Promise<{ analysis: LogAnalysis; truncated: boolean }> {
  const client = getAnthropic();
  const { content, truncated } = prepareLogContent(raw);

  const intro = [
    filename ? `Fichier : ${filename}` : null,
    truncated
      ? "NB : le fichier étant volumineux, ceci est un extrait filtré (début + lignes d'erreur/alarme + fin). Les comptages d'occurrences portent sur cet extrait."
      : null,
    "Logs à analyser :",
  ]
    .filter(Boolean)
    .join("\n");

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: `${intro}\n\n${content}` }],
      output_config: { format: analysisFormat },
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
    throw new Error("Le modèle n'a pas renvoyé d'analyse exploitable.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("L'analyse renvoyée par le modèle est illisible. Réessaie.");
  }
  const result = LogAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("L'analyse renvoyée par le modèle est incomplète. Réessaie.");
  }
  return { analysis: result.data, truncated };
}
