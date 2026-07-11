import { randomUUID } from "crypto";
import { createJsonStore } from "./jsonstore";
import type { Procedure, ProcedureRecord } from "./types";

// Persistance des procédures générées (module 5), sur le store JSON générique.

const store = createJsonStore<ProcedureRecord>("procedures.json");

/** Liste les procédures, de la plus récente à la plus ancienne. */
export async function listProcedures(): Promise<ProcedureRecord[]> {
  const items = await store.list();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Enregistre une procédure et la renvoie. */
export function saveProcedure(input: {
  demande: string;
  procedure: Procedure;
  docIds: string[];
}): Promise<ProcedureRecord> {
  return store.add({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    demande: input.demande,
    procedure: input.procedure,
    docIds: input.docIds,
  });
}

/** Supprime une procédure par identifiant. */
export function deleteProcedure(id: string): Promise<void> {
  return store.remove(id);
}
