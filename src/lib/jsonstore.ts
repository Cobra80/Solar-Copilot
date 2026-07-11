import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { DATA_DIR } from "./paths";

// Fabrique de stores JSON sur fichier local (usage perso, mono-utilisateur).
//
// Garanties d'intégrité (identiques pour chaque store) :
// - list() ne renvoie [] que si le fichier n'existe pas encore (ENOENT). Un fichier
//   corrompu est mis de côté (.corrupt-<ts>) et l'erreur remonte — on n'écrase jamais
//   silencieusement les données.
// - Écriture atomique (fichier temporaire + rename).
// - Écritures sérialisées par une file de promesses propre à chaque store
//   (pas de read-modify-write concurrent au sein du process).

export interface JsonStore<T extends { id: string }> {
  /** Liste brute (non triée). */
  list(): Promise<T[]>;
  /** Ajoute un élément complet (id inclus) et le renvoie. */
  add(item: T): Promise<T>;
  /** Supprime par identifiant. */
  remove(id: string): Promise<void>;
}

export function createJsonStore<T extends { id: string }>(filename: string): JsonStore<T> {
  const file = path.join(DATA_DIR, filename);
  let queue: Promise<unknown> = Promise.resolve();

  function withLock<R>(fn: () => Promise<R>): Promise<R> {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  }

  async function readAll(): Promise<T[]> {
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const backup = `${file}.corrupt-${Date.now()}`;
      await fs.rename(file, backup).catch(() => {});
      throw new Error(
        `Le fichier de données ${filename} est corrompu. Il a été sauvegardé sous ` +
          `${path.basename(backup)} — les données n'ont pas été écrasées.`,
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Le fichier ${filename} n'a pas le format attendu (tableau JSON).`);
    }
    return parsed as T[];
  }

  async function writeAll(items: T[]): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = path.join(DATA_DIR, `.${filename}-${randomUUID()}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(items, null, 2), "utf-8");
    try {
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.unlink(tmp).catch(() => {});
      throw err;
    }
  }

  return {
    list: readAll,
    add(item: T): Promise<T> {
      return withLock(async () => {
        const items = await readAll();
        items.push(item);
        await writeAll(items);
        return item;
      });
    },
    remove(id: string): Promise<void> {
      return withLock(async () => {
        const items = await readAll();
        await writeAll(items.filter((i) => i.id !== id));
      });
    },
  };
}
