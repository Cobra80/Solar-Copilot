import path from "path";

// Racine de stockage des données de l'app.
// - En local (dev) : `./data` à la racine du projet.
// - En production (Railway…) : définir `DATA_DIR` pour pointer vers un volume
//   persistant (ex. `DATA_DIR=/data`), sinon les données seraient perdues à
//   chaque redéploiement du conteneur.
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");

// Fichiers originaux des documents du second cerveau.
export const DOCS_DIR = path.join(DATA_DIR, "docs");
