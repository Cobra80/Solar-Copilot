import Anthropic from "@anthropic-ai/sdk";

// Modèle par défaut. Voir https://docs.claude.com pour les autres modèles.
export const MODEL = "claude-opus-4-8";

let client: Anthropic | null = null;

/**
 * Renvoie un client Anthropic prêt à l'emploi.
 * Construction paresseuse pour ne pas planter au chargement du module
 * si la clé API n'est pas encore configurée.
 */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY manquante. Ajoute ta clé API dans le fichier .env.local " +
        "(voir .env.local.example), puis relance le serveur.",
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Traduit les erreurs du SDK en messages clairs pour l'utilisateur.
 * (APIConnectionError est une sous-classe d'APIError : à tester en premier.)
 */
export function toFriendlyError(err: unknown): Error {
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error("Impossible de joindre l'API Claude. Vérifie ta connexion internet.");
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401) {
      return new Error("Clé API invalide. Vérifie ANTHROPIC_API_KEY dans .env.local.");
    }
    if (err.status === 429) {
      return new Error("Limite de requêtes API atteinte. Réessaie dans quelques instants.");
    }
    if (err.status !== undefined && err.status >= 500) {
      return new Error("L'API Claude est momentanément surchargée. Réessaie dans quelques instants.");
    }
  }
  return err instanceof Error ? err : new Error("Erreur inconnue.");
}
