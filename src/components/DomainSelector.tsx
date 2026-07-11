"use client";

import { useEffect, useState } from "react";
import { DOMAINES, DOMAINE_DEFAUT, isDomaine, type Domaine } from "@/lib/domains";

const STORAGE_KEY = "solar-copilot-domaine";

/**
 * Domaine métier courant, mémorisé dans localStorage et partagé entre tous les
 * modules : choisir « HTA » sur le rapport le garde sélectionné sur les procédures.
 */
export function useDomaine(): [Domaine, (d: Domaine) => void] {
  const [domaine, setDomaineState] = useState<Domaine>(DOMAINE_DEFAUT);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isDomaine(saved)) setDomaineState(saved);
  }, []);

  function setDomaine(d: Domaine) {
    setDomaineState(d);
    try {
      localStorage.setItem(STORAGE_KEY, d);
    } catch {
      /* stockage indisponible : le choix reste au moins valable pour la session */
    }
  }

  return [domaine, setDomaine];
}

/** Contrôle segmenté PV / HTA / HTB. */
export default function DomainSelector({
  value,
  onChange,
  className = "",
}: {
  value: Domaine;
  onChange: (d: Domaine) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Domaine de l'intervention"
      className={`inline-flex items-center rounded-lg bg-slate-100 p-0.5 ${className}`}
    >
      {DOMAINES.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onChange(d.id)}
          aria-pressed={value === d.id}
          title={d.label}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            value === d.id
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {d.court}
        </button>
      ))}
    </div>
  );
}
