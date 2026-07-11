import { randomUUID } from "crypto";
import { createJsonStore } from "./jsonstore";
import type { Intervention, Report } from "./types";

// Persistance des interventions (module 1), bâtie sur le store JSON générique.
// Voir jsonstore.ts pour les garanties d'intégrité (écriture atomique,
// sauvegarde des fichiers corrompus, écritures sérialisées).

const store = createJsonStore<Intervention>("interventions.json");

/** Liste les interventions, de la plus récente à la plus ancienne. */
export async function listInterventions(): Promise<Intervention[]> {
  const items = await store.list();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Enregistre une nouvelle intervention et la renvoie. */
export function saveIntervention(input: {
  notes: string;
  report: Report;
}): Promise<Intervention> {
  return store.add({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    notes: input.notes,
    report: input.report,
  });
}

/** Supprime une intervention par identifiant. */
export function deleteIntervention(id: string): Promise<void> {
  return store.remove(id);
}
