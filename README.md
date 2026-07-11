# ☀️ Solar Copilot

Boîte à outils IA pour techniciens de maintenance (O&M) électrotechnique :
**photovoltaïque, postes HTA et postes HTB**. Un sélecteur de domaine (PV / HTA / HTB)
présent sur chaque module adapte l'IA au métier de l'intervention — vocabulaire,
équipements et surtout consignes de sécurité (consignation HTA/HTB, VAT, MALT-CC,
habilitations…).

**Module 1 — Rapport d'intervention** (`/`) : colle tes notes brutes de terrain,
l'app génère un rapport d'intervention structuré (constat, actions, recommandations,
statut), exportable en PDF et transformable en email client.

> Exemple d'entrée :
> `onduleur 3 défaut isolement 14h32 reset ok production rétablie`

**Module 2 — Analyse de logs onduleurs** (`/logs`) : charge un export de logs
(CSV/log/txt — SMA, Huawei, Sungrow, SolarEdge…), l'app regroupe et compte les
erreurs, repère les anomalies (défauts récurrents au petit matin, derating thermique,
pertes de communication…) et donne des recommandations priorisées. Les gros fichiers
sont automatiquement échantillonnés (début + lignes d'erreur + fin).

**Module 3 — Carnet de dépannage** (`/carnet`) : note ton cas en vrac
(« erreur 206 → fusible DC → remplacé »), l'IA le structure en fiche (relisible et
modifiable avant enregistrement). Au fil du temps, le carnet devient ta base de
connaissances : filtre instantané + recherche en langage naturel
(« qu'est-ce que j'avais fait sur l'erreur 206 Huawei ? ») dont la réponse s'appuie
uniquement sur tes fiches.

**Module 4 — Second cerveau** (`/cerveau`) : glisse tes notices, procédures et
rapports (PDF — y compris scannés, Word, photos, texte), puis pose tes questions :
« quelle est la procédure pour remplacer un sectionneur ? ». La réponse est rédigée
uniquement à partir de tes documents **et de ton carnet de dépannage**, sources
citées, consignes de sécurité reprises fidèlement.

**Module 5 — Générateur de procédures** (`/procedures`) : décris une tâche
(« remplacement d'un optimiseur SolarEdge ») et obtiens une procédure complète :
EPI, risques, matériel, étapes détaillées, contrôles finaux. Si ta bibliothèque
couvre le sujet, la procédure s'appuie dessus (les valeurs précises — couples de
serrage, références — viennent de tes documents, jamais inventées) et cite ses
sources. Enregistrable et exportable en PDF.

**Les modules se parlent :** un bouton « 📓 Ajouter au carnet » sur chaque rapport
d'intervention convertit le rapport en fiche pré-remplie ; le Cerveau consulte
automatiquement le carnet en plus des documents ; le générateur de procédures
puise dans les deux.

## Démarrage

1. **Clé API Claude** — copie `.env.local.example` en `.env.local` et renseigne ta clé :

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   (Clé à créer sur https://console.anthropic.com/)

2. **Installer** (déjà fait si tu as `node_modules/`) :

   ```bash
   npm install
   ```

3. **Lancer** :

   ```bash
   npm run dev
   ```

   Puis ouvre http://localhost:3000

## 📱 Sur téléphone (PWA)

L'app est installable sur l'écran d'accueil (plein écran, comme une vraie app).

1. Sur le PC, lance `npm run dev` : Next affiche une ligne **Network** du type
   `http://192.168.x.x:3000` (l'IP locale de ton PC ; sinon `ipconfig`).
2. Autorise Node/port 3000 dans le pare-feu Windows (réseaux privés) à la 1re demande.
3. Sur le téléphone (même Wi-Fi que le PC), ouvre cette URL `http://192.168.x.x:3000`.
4. **iPhone (Safari)** : Partager → « Sur l'écran d'accueil ».
   **Android (Chrome)** : menu ⋮ → « Installer l'application » / « Ajouter à l'écran d'accueil ».

⚠️ En Wi-Fi local, l'app ne tourne que **si le PC est allumé et sur le même réseau**.
Pour un accès partout (4G, hors du réseau), déploie-la en ligne ⤵️

## 🚀 Déploiement en ligne (Railway)

Railway fait tourner l'app dans un **conteneur persistant** avec un **volume** : le
stockage fichier (`data/`) survit aux redéploiements (ce que Vercel ne permet pas).

### 1. Variables d'environnement (à définir dans Railway)

| Variable | Valeur | Rôle |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-…` | Appels Claude (même clé que ton `.env.local`) |
| `APP_PASSWORD` | un mot de passe fort | **Obligatoire.** Protège l'accès public. Sans lui → l'app renvoie 503 |
| `DATA_DIR` | `/data` | Écrit les données sur le volume persistant |

> 🔑 **Connexion** : à la première visite, une page `/login` demande le mot de passe
> **une seule fois** ; la session dure 180 jours (cookie). Un bouton « Déconnexion »
> est disponible dans l'en-tête. Changer `APP_PASSWORD` déconnecte toutes les sessions.

### 2. Volume (indispensable — sinon perte de données à chaque déploiement)

Ajoute un **Volume** avec pour point de montage `/data` (identique à `DATA_DIR`).

### 3. Déployer — au choix

**Option A — CLI Railway (le plus rapide, sans GitHub) :**

```bash
npm i -g @railway/cli
railway login      # ouvre le navigateur pour t'authentifier
railway init       # crée le projet
railway up         # déploie le dossier courant
```

Puis dans le dashboard Railway : ajoute le **Volume** (`/data`) et les **Variables**,
et relance un déploiement (`railway up` ou bouton *Redeploy*).

**Option B — GitHub (auto-déploiement à chaque `git push`) :**

```bash
git remote add origin https://github.com/<toi>/solar-copilot.git
git push -u origin main
```

Puis Railway → *New Project* → *Deploy from GitHub repo* → sélectionne le repo,
ajoute le **Volume** et les **Variables**. Chaque `git push` redéploie tout seul.

### 4. Après déploiement

- Ouvre l'URL publique fournie par Railway → page de connexion (ton mot de passe, une seule fois).
- Sur ton téléphone : ouvre l'URL, connecte-toi, puis « Ajouter à l'écran d'accueil ».
- Le port est géré automatiquement par Railway (`next start` lit `PORT`).

> 💰 **Coût** : Railway est payant à l'usage (plan Hobby ~5 $/mois). L'app est légère.
> Ta clé API tourne côté serveur Railway : chaque génération consomme des tokens.

## Fonctionnalités

- 📝 Génération de rapport structuré à partir de notes brutes
- 🔍 Analyse de logs onduleurs : erreurs regroupées, anomalies, recommandations
- 📓 Carnet de dépannage : fiches structurées par l'IA + recherche en langage naturel
- 🧠 Second cerveau : bibliothèque de documents interrogeable (réponses sourcées)
- 📋 Générateur de procédures : EPI, risques, matériel, étapes — fondé sur ta bibliothèque
- 📄 Export PDF (via l'impression du navigateur → « Enregistrer au format PDF »)
- ✉️ Génération d'un email client prêt à envoyer
- 🗂️ Données stockées localement dans `data/` (interventions, fiches, documents, procédures)

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · API Claude (`@anthropic-ai/sdk`).

Détails d'architecture : voir [`AGENTS.md`](./AGENTS.md).

## Feuille de route

Dernier module envisagé : assistant vocal (plutôt en app desktop).
