import { randomUUID } from "crypto";
import { createJsonStore } from "./jsonstore";
import type { Tache, TacheDraft } from "./types";

// Persistance des tâches (module 6, to-do), sur le store JSON générique.

const store = createJsonStore<Tache>("todos.json");

/**
 * Liste les tâches, triées pour l'affichage :
 * - à faire avant terminées ;
 * - par échéance croissante (sans échéance en dernier) ;
 * - puis par date de création.
 */
export async function listTaches(): Promise<Tache[]> {
  const items = await store.list();
  return items.sort((a, b) => {
    if (a.fait !== b.fait) return a.fait ? 1 : -1;
    const ae = a.echeance || "9999-99-99";
    const be = b.echeance || "9999-99-99";
    if (ae !== be) return ae < be ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** Ajoute une tâche et la renvoie. */
export function addTache(draft: TacheDraft): Promise<Tache> {
  return store.add({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    titre: draft.titre,
    echeance: draft.echeance,
    note: draft.note,
    fait: false,
    faitAt: "",
  });
}

/** Modifie une tâche (titre/échéance/note/statut). Gère l'horodatage de complétion. */
export function updateTache(
  id: string,
  patch: Partial<Pick<Tache, "titre" | "echeance" | "note" | "fait">>,
): Promise<Tache | null> {
  const full: Partial<Omit<Tache, "id">> = { ...patch };
  if (patch.fait !== undefined) {
    full.faitAt = patch.fait ? new Date().toISOString() : "";
  }
  return store.update(id, full);
}

/** Supprime une tâche. */
export function deleteTache(id: string): Promise<void> {
  return store.remove(id);
}
