<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Solar Copilot

Boîte à outils IA pour techniciens de maintenance (O&M) **électrotechnique** :
photovoltaïque, postes HTA et postes HTB. (Le nom « Solar Copilot » est conservé
même si la portée dépasse le solaire.) Vision : un seul produit (base de connaissances
+ assistant IA) avec plusieurs modules posés sur un socle commun (LLM Claude, futur
RAG, export PDF/email).

**Sélecteur de domaine (PV / HTA / HTB).** Chaque module qui appelle l'IA (rapport,
logs, carnet, procédures) porte un sélecteur de domaine. Le choix est mémorisé et
partagé entre modules (localStorage `solar-copilot-domaine`, via `useDomaine()`), et
injecté dans les prompts par `domainePreambule(domaine)` — ce qui ancre vocabulaire,
équipements et **consignes de sécurité** (ex. consignation HTA/HTB : séparation,
condamnation, VAT, MALT-CC, habilitations). Voir `src/lib/domains.ts`.

**Modules en place :**
1. **Rapport d'intervention** (`/`) — notes de terrain → rapport structuré, export PDF,
   email client, historique local.
2. **Analyse de logs onduleurs** (`/logs`) — import CSV/log/txt (SMA, Huawei, Sungrow…)
   ou copier-coller → erreurs regroupées et comptées, anomalies (récurrences horaires,
   derating, pertes de comm), recommandations priorisées, export PDF.
3. **Carnet de dépannage** (`/carnet`) — note brute → fiche structurée éditable
   (marque, matériel, code erreur, symptôme, diagnostic, solution, tags) → base de
   connaissances personnelle. Filtre local instantané + recherche IA en langage
   naturel fondée uniquement sur les fiches.
4. **Second cerveau** (`/cerveau`) — bibliothèque de documents (PDF y compris
   scannés, DOCX, images, texte) interrogeable en langage naturel, réponses fondées
   uniquement sur les documents avec sources citées.
5. **Générateur de procédures** (`/procedures`) — décris une tâche → procédure
   complète (EPI, risques, matériel, étapes, contrôles finaux), fondée en priorité
   sur la bibliothèque (les valeurs précises viennent des documents, jamais
   inventées — « voir notice constructeur » sinon), sources citées, enregistrable
   et exportable en PDF.

**Ponts entre modules :**
- Rapport → Carnet : bouton « Ajouter au carnet » sur un rapport ; conversion IA en
  fiche via `/api/cases/structure`, brouillon transmis par
  `sessionStorage["solar-copilot-carnet-draft"]`, la page carnet l'ouvre pré-rempli.
- Carnet → Cerveau : `askDocs()` reçoit aussi les fiches du carnet, agrégées en
  pseudo-document (id réservé `"carnet"`, jamais persisté) qui traverse la sélection
  et la réponse comme un document normal.
- Bibliothèque → Procédures : `generateProcedure()` réutilise `gatherContext()` /
  `buildContextParts()` (exportés par brain.ts) — mêmes sources, mêmes budgets.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
- API Claude via `@anthropic-ai/sdk` (modèle `claude-opus-4-8`), structured outputs
- **PWA** installable sur mobile : `src/app/manifest.ts` + métas iOS/Android dans
  `layout.tsx` (`appleWebApp`, `viewport.themeColor`), icônes dans `public/`
  (`icon.svg`, `icon-192/512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`).
  En-tête (`AppHeader`) : nav qui scrolle horizontalement sur petit écran.
  `globals.css` force 16px sur les champs < 640px (anti-zoom iOS).
- Usage perso, **pas d'authentification**
- Persistance : fichier JSON local `data/interventions.json` (via `src/lib/store.ts`,
  volontairement remplaçable par une vraie base plus tard)

## Carte du code

- `src/lib/types.ts` — types partagés (sans dépendance runtime → importables côté client)
- `src/lib/domains.ts` — domaines métier (PV/HTA/HTB) : type `Domaine`, `DOMAINE_CONTEXTE` (contexte injecté dans les prompts), `domainePreambule()`, exemples par domaine. Sans dépendance runtime
- `src/components/DomainSelector.tsx` — contrôle segmenté PV/HTA/HTB + hook `useDomaine()` (choix mémorisé en localStorage, partagé entre modules)
- `src/lib/schema.ts` — schéma zod du rapport (`z.ZodType<Report>`, synchronisé au type par le compilateur) ; valide la sortie du modèle et les bodies des routes
- `src/lib/anthropic.ts` — client Claude (construction paresseuse) + `toFriendlyError()` (messages clairs pour 401/429/5xx/réseau)
- `src/lib/report.ts` — génération du rapport (structured outputs) et de l'email ; vérifie `stop_reason` (troncature/refus) avant de parser
- `src/lib/loganalysis.ts` — analyse de logs (structured outputs) ; `prepareLogContent()` échantillonne les gros fichiers (> 300k caractères : début + lignes d'erreur/alarme + fin) pour maîtriser le coût API
- `src/lib/cases.ts` — carnet : structuration d'une note en fiche + recherche IA. La recherche envoie les fiches compactées dans le prompt (cap : 300 fiches les plus récentes, 400 car./champ) — au-delà de ce volume, passer à une recherche par embeddings
- `src/lib/extract.ts` — extraction de texte à l'import : pdf-parse v2 (`new PDFParse({data}).getText()`), repli transcription Claude si PDF scanné (< 100 car. extraits, max 30 p./10 Mo), mammoth pour .docx, transcription Claude pour les images. ⚠️ pdf-parse doit rester dans `serverExternalPackages` (next.config.ts) : il ne se bundle pas
- `src/lib/brain.ts` — second cerveau : résumé + mots-clés à l'import ; réponse en 2 étapes (sélection des docs pertinents sur résumés → réponse sur texte complet, budget 250k car.) ; étape 1 sautée si la bibliothèque < 80k car. Exporte `gatherContext()` / `buildContextParts()` (partagés avec les procédures)
- `src/lib/procedures.ts` — génération de procédures fondée sur la bibliothèque (valeurs précises jamais inventées)
- `src/lib/docstore.ts` — index `data/documents.json` (texte extrait inclus) + fichiers originaux `data/docs/<uuid>.<ext>`
- `src/lib/procstore.ts` — persistance des procédures (`data/procedures.json`)
- `src/lib/paths.ts` — racine de stockage `DATA_DIR` (env `DATA_DIR` sinon `./data`) : pointe vers un volume persistant en prod (Railway)
- `src/lib/jsonstore.ts` — fabrique de stores JSON : écriture atomique (tmp+rename), fichier corrompu mis de côté en `.corrupt-<ts>` (jamais écrasé), écritures sérialisées par file de promesses propre à chaque store
- `src/lib/store.ts` — persistance des interventions (sur jsonstore)
- `src/lib/casestore.ts` — persistance des fiches de dépannage (sur jsonstore, `data/cases.json`)
- `src/app/api/generate` — POST notes → rapport structuré
- `src/app/api/email` — POST rapport → brouillon d'email client
- `src/app/api/interventions` — GET/POST/DELETE de l'historique
- `src/app/api/analyze-logs` — POST contenu de logs → analyse structurée (garde-fou 5 Mo)
- `src/app/api/cases` — GET/POST/DELETE des fiches du carnet
- `src/app/api/cases/structure` — POST note brute → fiche structurée
- `src/app/api/cases/search` — POST question → réponse + ids des fiches pertinentes
- `src/app/api/docs` — GET liste / POST upload multipart (max 15 Mo) / DELETE
- `src/app/api/docs/ask` — POST question → réponse + ids des documents sources
- `src/app/api/procedures` — GET/POST/DELETE des procédures enregistrées
- `src/app/api/procedures/generate` — POST tâche → procédure + sources
- `src/proxy.ts` — portail d'auth (HTTP Basic Auth, Next 16 « proxy » = ex-middleware, runtime Node). Fail-closed en production : sans `APP_PASSWORD` → 503. Assets statiques + fichiers PWA exclus du matcher
- `src/components/AppHeader.tsx` — en-tête partagé avec navigation entre modules
- `src/app/page.tsx` — interface rapport (client component). Les réponses asynchrones
  sont gardées par une « époque » (`epochRef`) : toute action qui change le rapport
  affiché (générer/charger/nouveau) l'incrémente, et une réponse partie sous une époque
  antérieure est ignorée — ne pas contourner ce mécanisme en ajoutant des setState
  directs dans des callbacks async.
- `src/app/logs/page.tsx` — interface analyse de logs (même mécanisme d'époque).
  Lecture des fichiers avec détection d'encodage (BOM UTF-16, UTF-8 strict,
  repli Windows-1252) car les exports constructeurs sont rarement en UTF-8 propre.

## Config

Variables d'environnement (`.env.local` en local, dashboard Railway en prod ; voir
`.env.local.example`) :
- `ANTHROPIC_API_KEY` — clé API Claude (obligatoire)
- `APP_PASSWORD` — mot de passe d'accès. **Obligatoire en prod** (sinon 503) ; vide en
  local = accès libre. `APP_USER` facultatif (défaut `solar`)
- `DATA_DIR` — dossier de stockage ; en prod, le point de montage du volume (`/data`)

## Lancer

```bash
npm run dev     # http://localhost:3000 (dev)
npm run build && npm run start   # build + serveur de production (ce que Railway exécute)
```

## Déploiement

Railway (conteneur persistant + volume monté sur `DATA_DIR`). Étapes détaillées :
voir la section « Déploiement en ligne » du `README.md`.
