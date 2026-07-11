// Domaines métier de l'app (sélecteur PV / HTA / HTB).
// Ce module n'a aucune dépendance runtime → importable côté client ET serveur.

export type Domaine = "pv" | "hta" | "htb";

export const DOMAINE_DEFAUT: Domaine = "pv";

export const DOMAINES: { id: Domaine; court: string; label: string }[] = [
  { id: "pv", court: "PV", label: "Photovoltaïque" },
  { id: "hta", court: "HTA", label: "Poste HTA" },
  { id: "htb", court: "HTB", label: "Poste HTB" },
];

export function isDomaine(v: unknown): v is Domaine {
  return v === "pv" || v === "hta" || v === "htb";
}

// Contexte métier injecté dans les prompts IA : ancre le vocabulaire, les
// équipements et surtout les consignes de sécurité propres à chaque domaine.
export const DOMAINE_CONTEXTE: Record<Domaine, string> = {
  pv: `Domaine : INSTALLATION PHOTOVOLTAÏQUE (production solaire, O&M).
Équipements typiques : onduleurs (SMA, Huawei, Sungrow, SolarEdge, Fronius…), strings et modules PV, optimiseurs / micro-onduleurs, boîtes de jonction, coffrets DC/AC, parafoudres, sectionneurs DC, monitoring / dataloggers.
Notions : défaut d'isolement (Riso), courant de string, MPPT, derating thermique, découplage réseau, production / irradiation.
Sécurité : risque DC présent dès qu'il y a du soleil (les modules produisent même hors réseau) ; EPI et procédures adaptés au courant continu.`,

  hta: `Domaine : POSTE / RÉSEAU HTA (Haute Tension A, 1 kV à 50 kV).
Équipements typiques : cellules HTA (SM6…), disjoncteurs, interrupteurs-sectionneurs, transformateurs HTA/BT, relais de protection (Sepam, MiCOM…), TGBT, jeux de barres.
Notions : cellule, tranche, déclenchement, protection ampèremétrique, sélectivité, régime de neutre.
Sécurité PRIMORDIALE : consignation électrique (séparation, condamnation, VAT — vérification d'absence de tension —, MALT et mise en court-circuit), habilitations (H1V, H2V, HC, BR, BC), distances de sécurité, EPI HT (gants isolants, écran facial, perche, VAT). Ne jamais improviser une manœuvre HT.`,

  htb: `Domaine : POSTE SOURCE / RÉSEAU HTB (Haute Tension B, > 50 kV).
Équipements typiques : transformateurs de puissance, disjoncteurs HTB (SF6…), sectionneurs, jeux de barres, réducteurs de mesure (TC/TT), protections différentielles et de distance, réenclencheurs.
Notions : travée / tranche, protection différentielle, sélectivité, plan de protection, régime de neutre.
Sécurité CRITIQUE : consignation HTB assurée par le chargé de consignation, condamnation, VAT HT, MALT et court-circuit, habilitations (H2V, HC, HE), distances de voisinage renforcées, coactivité avec le gestionnaire de réseau (accès, régime d'exploitation). Aucune manœuvre sans ordre et sans consignation formelle.`,
};

/** Bloc à insérer dans un system prompt pour l'ancrer sur un domaine. */
export function domainePreambule(domaine?: Domaine): string {
  if (!domaine) return "";
  return `\n\nCONTEXTE MÉTIER DE CETTE INTERVENTION :\n${DOMAINE_CONTEXTE[domaine]}\nAdapte le vocabulaire, les équipements, les risques et les consignes de sécurité à ce contexte. Ne mélange pas les domaines.`;
}

// Exemples pré-remplis proposés dans l'UI, par domaine.
export const DOMAINE_EXEMPLES: Record<
  Domaine,
  { rapport: string; carnet: string; procedure: string; logsHint: string }
> = {
  pv: {
    rapport: "onduleur 3 défaut isolement 14h32 reset ok production rétablie",
    carnet:
      "huawei sun2000 erreur 206 string 4 tension basse, fusible dc 15A hs dans la boite de jonction, remplacé, controle serrage, redémarrage ok",
    procedure: "Remplacement d'un optimiseur SolarEdge sur toiture inclinée",
    logsHint: "onduleurs (SMA, Huawei, Sungrow, SolarEdge…)",
  },
  hta: {
    rapport:
      "poste HTA client Leroy, cellule arrivée disjoncteur déclenché sur défaut, protection Sepam max I phase, contrôle visuel RAS, réarmement, remise sous tension ok 10h15",
    carnet:
      "cellule SM6 HTA disjoncteur déclenche répétitif protection homopolaire, mesure isolement câble départ HS, câble sectionné, réparé et essais dielectriques ok",
    procedure: "Consignation d'une cellule HTA pour intervention sur le départ",
    logsHint: "protections HTA (Sepam, MiCOM…), SCADA",
  },
  htb: {
    rapport:
      "poste source 63kV travée transfo TR1, protection différentielle transfo déclenchée, analyse gaz Buchholz, contrôle, consignation en cours, expertise transfo planifiée",
    carnet:
      "disjoncteur HTB 63kV pression SF6 basse alarme, appoint gaz après recherche fuite sur raccord, contrôle densité ok, remise en service",
    procedure: "Consignation d'une travée HTB pour maintenance disjoncteur",
    logsHint: "protections HTB (différentielle, distance…), SCADA / téléconduite",
  },
};
