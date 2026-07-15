import { z } from "zod";
import type {
  CaseDraft,
  CaseSearchResult,
  DocAnswer,
  LogAnalysis,
  Procedure,
  Report,
  TacheDraft,
} from "./types";

// Schéma de validation runtime du rapport.
// Typé z.ZodType<Report> : le compilateur garantit qu'il reste synchronisé
// avec le type Report de types.ts.
export const ReportSchema: z.ZodType<Report> = z.object({
  titre: z.string(),
  site: z.string(),
  date: z.string(),
  materiel: z.array(z.string()),
  constat: z.string(),
  actionsRealisees: z.array(z.string()),
  piecesRemplacees: z.array(z.string()),
  recommandations: z.array(z.string()),
  statut: z.enum(["résolu", "à suivre", "en attente de pièces", "non résolu"]),
  productionRetablie: z.enum(["oui", "non", "inconnu"]),
});

const GraviteSchema = z.enum(["critique", "majeure", "mineure", "info"]);

// Schéma de validation runtime de l'analyse de logs (même principe que ReportSchema).
export const LogAnalysisSchema: z.ZodType<LogAnalysis> = z.object({
  resume: z.string(),
  periode: z.string(),
  equipements: z.array(z.string()),
  santeGlobale: z.enum(["bon", "à surveiller", "dégradé", "critique"]),
  erreurs: z.array(
    z.object({
      code: z.string(),
      libelle: z.string(),
      occurrences: z.number(),
      gravite: GraviteSchema,
      description: z.string(),
      actionRecommandee: z.string(),
    }),
  ),
  anomalies: z.array(
    z.object({
      titre: z.string(),
      description: z.string(),
      gravite: GraviteSchema,
    }),
  ),
  recommandations: z.array(z.string()),
});

// Schéma de validation runtime d'une fiche de dépannage (module 3).
export const CaseDraftSchema: z.ZodType<CaseDraft> = z.object({
  marque: z.string(),
  materiel: z.string(),
  codeErreur: z.string(),
  symptome: z.string(),
  diagnostic: z.string(),
  solution: z.string(),
  tags: z.array(z.string()),
});

// Schéma de validation runtime du résultat de recherche IA (module 3).
export const CaseSearchResultSchema: z.ZodType<CaseSearchResult> = z.object({
  reponse: z.string(),
  casIds: z.array(z.string()),
});

// Schéma de validation runtime d'une réponse documentaire (module 4).
export const DocAnswerSchema: z.ZodType<DocAnswer> = z.object({
  reponse: z.string(),
  docIds: z.array(z.string()),
});

// Résumé de document généré à l'import (module 4).
export const DocSummarySchema = z.object({
  resume: z.string(),
  motsCles: z.array(z.string()),
});

// Sélection de documents pertinents (étape 1 de la réponse documentaire, module 4).
export const DocSelectionSchema = z.object({
  docIds: z.array(z.string()),
});

// ---- Module 5 : procédures ----

const procedureShape = {
  titre: z.string(),
  objectif: z.string(),
  dureeEstimee: z.string(),
  personnel: z.string(),
  epi: z.array(z.string()),
  risques: z.array(z.string()),
  materiel: z.array(z.string()),
  etapes: z.array(
    z.object({
      titre: z.string(),
      details: z.array(z.string()),
      attention: z.string(),
    }),
  ),
  controlesFinaux: z.array(z.string()),
  avertissement: z.string(),
};

// Validation d'une procédure (enregistrement).
export const ProcedureSchema: z.ZodType<Procedure> = z.object(procedureShape);

// Sortie du générateur : la procédure + les sources utilisées.
export const GeneratedProcedureSchema = z.object({
  ...procedureShape,
  docIds: z.array(z.string()),
});

// ---- Module 6 : to-do / rappels ----

// Une échéance est soit vide, soit une date "YYYY-MM-DD".
const echeanceSchema = z
  .string()
  .refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s), "Échéance invalide (attendu YYYY-MM-DD ou vide).");

// Contenu d'une tâche (ajout manuel ou issu du découpage IA).
export const TacheDraftSchema: z.ZodType<TacheDraft> = z.object({
  titre: z.string().min(1),
  echeance: echeanceSchema,
  note: z.string(),
});

// Modification partielle d'une tâche (cocher/décocher, éditer).
export const TachePatchSchema = z
  .object({
    titre: z.string().min(1),
    echeance: echeanceSchema,
    note: z.string(),
    fait: z.boolean(),
  })
  .partial();

// Découpage IA d'un pavé de texte en plusieurs tâches.
export const TachesParseSchema = z.object({
  taches: z.array(TacheDraftSchema),
});
