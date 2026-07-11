import { randomUUID } from "crypto";
import { createJsonStore } from "./jsonstore";
import type { Case, CaseDraft } from "./types";

// Persistance des fiches de dépannage (module 3), sur le store JSON générique.

const store = createJsonStore<Case>("cases.json");

/** Liste les fiches, de la plus récente à la plus ancienne. */
export async function listCases(): Promise<Case[]> {
  const items = await store.list();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Enregistre une nouvelle fiche et la renvoie. */
export function saveCase(draft: CaseDraft): Promise<Case> {
  return store.add({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...draft,
  });
}

/** Supprime une fiche par identifiant. */
export function deleteCase(id: string): Promise<void> {
  return store.remove(id);
}
