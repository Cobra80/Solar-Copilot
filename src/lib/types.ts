// Types partagés entre le serveur et le client.
// Ce fichier ne contient AUCUNE dépendance runtime (pas de SDK, pas de zod),
// il peut donc être importé sans risque dans les composants client.

export type Statut = "résolu" | "à suivre" | "en attente de pièces" | "non résolu";
export type ProductionRetablie = "oui" | "non" | "inconnu";

export interface Report {
  titre: string;
  site: string; // "" si non précisé
  date: string; // "" si non précisé
  materiel: string[];
  constat: string;
  actionsRealisees: string[];
  piecesRemplacees: string[];
  recommandations: string[];
  statut: Statut;
  productionRetablie: ProductionRetablie;
}

export interface Intervention {
  id: string;
  createdAt: string; // ISO 8601
  notes: string;
  report: Report;
}

// ---- Module 2 : analyse de logs d'onduleurs ----

export type Gravite = "critique" | "majeure" | "mineure" | "info";
export type SanteGlobale = "bon" | "à surveiller" | "dégradé" | "critique";

export interface LogErreur {
  code: string; // code ou identifiant de l'erreur ("" si non codifié)
  libelle: string;
  occurrences: number;
  gravite: Gravite;
  description: string;
  actionRecommandee: string;
}

export interface LogAnomalie {
  titre: string;
  description: string;
  gravite: Gravite;
}

export interface LogAnalysis {
  resume: string;
  periode: string; // "" si indéterminée
  equipements: string[];
  santeGlobale: SanteGlobale;
  erreurs: LogErreur[];
  anomalies: LogAnomalie[];
  recommandations: string[];
}

// ---- Module 3 : carnet de dépannage ----

/** Fiche de dépannage, telle que structurée par l'IA (avant enregistrement). */
export interface CaseDraft {
  marque: string; // Huawei, SMA, Sungrow… ("" si non précisé)
  materiel: string; // modèle / équipement concerné
  codeErreur: string; // "206", "3501"… ("" si non codifié)
  symptome: string; // ce qui a été observé
  diagnostic: string; // la cause identifiée
  solution: string; // ce qui a résolu le problème
  tags: string[]; // mots-clés courts en minuscules
}

/** Fiche enregistrée dans le carnet. */
export interface Case extends CaseDraft {
  id: string;
  createdAt: string; // ISO 8601
}

/** Résultat d'une recherche IA dans le carnet. */
export interface CaseSearchResult {
  reponse: string; // synthèse fondée sur les fiches
  casIds: string[]; // fiches pertinentes, par pertinence décroissante
}

// ---- Module 4 : second cerveau (bibliothèque de documents) ----

export type DocType = "pdf" | "docx" | "texte" | "image";

/** Métadonnées d'un document (sans le texte extrait — léger, pour l'UI). */
export interface DocMeta {
  id: string;
  createdAt: string; // ISO 8601
  nom: string; // nom de fichier d'origine
  type: DocType;
  taille: number; // octets
  resume: string; // résumé généré à l'import
  motsCles: string[];
  caracteres: number; // longueur du texte extrait
  tronque: boolean; // true si le texte stocké a été plafonné
}

/** Document complet tel que stocké (métadonnées + texte extrait). */
export interface DocEntry extends DocMeta {
  texte: string;
}

/** Réponse à une question posée sur la bibliothèque. */
export interface DocAnswer {
  reponse: string;
  docIds: string[]; // documents utilisés comme sources
}

// ---- Module 5 : générateur de procédures ----

export interface ProcedureEtape {
  titre: string;
  details: string[]; // instructions concrètes de l'étape
  attention: string; // avertissement spécifique ("" si aucun)
}

export interface Procedure {
  titre: string;
  objectif: string;
  dureeEstimee: string; // "" si non estimable
  personnel: string; // personnel requis et habilitations ("" si non applicable)
  epi: string[];
  risques: string[];
  materiel: string[]; // outillage, appareils de mesure, pièces
  etapes: ProcedureEtape[];
  controlesFinaux: string[];
  avertissement: string; // rappel de validation entreprise / notice constructeur
}

/** Procédure enregistrée dans la bibliothèque de procédures. */
export interface ProcedureRecord {
  id: string;
  createdAt: string; // ISO 8601
  demande: string; // la tâche décrite par l'utilisateur
  procedure: Procedure;
  docIds: string[]; // sources de la bibliothèque utilisées ("carnet" possible)
}
