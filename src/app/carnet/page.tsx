"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import type { Case, CaseDraft, CaseSearchResult } from "@/lib/types";

const EXEMPLE =
  "huawei sun2000 erreur 206 string 4 tension basse, fusible dc 15A hs dans la boite de jonction, remplacé, controle serrage, redémarrage ok";

function matchesFilter(c: Case, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  const haystack = [c.marque, c.materiel, c.codeErreur, c.symptome, c.diagnostic, c.solution, ...c.tags]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

export default function CarnetPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Nouveau cas
  const [showNew, setShowNew] = useState(false);
  const [rawNotes, setRawNotes] = useState("");
  const [structuring, setStructuring] = useState(false);
  const [draft, setDraft] = useState<CaseDraft | null>(null);
  const [saving, setSaving] = useState(false);

  // Recherche IA
  const [aiQuery, setAiQuery] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResult, setAiResult] = useState<CaseSearchResult | null>(null);

  const epochRef = useRef(0);
  const historyReqRef = useRef(0);

  useEffect(() => {
    refreshCases();
    // Brouillon transmis par un autre module (ex : « Ajouter au carnet » depuis
    // un rapport d'intervention) : on ouvre le formulaire pré-rempli.
    try {
      const raw = sessionStorage.getItem("solar-copilot-carnet-draft");
      if (raw) {
        sessionStorage.removeItem("solar-copilot-carnet-draft");
        const d = JSON.parse(raw) as Partial<CaseDraft>;
        if (d && typeof d.symptome === "string") {
          setDraft({
            marque: typeof d.marque === "string" ? d.marque : "",
            materiel: typeof d.materiel === "string" ? d.materiel : "",
            codeErreur: typeof d.codeErreur === "string" ? d.codeErreur : "",
            symptome: d.symptome,
            diagnostic: typeof d.diagnostic === "string" ? d.diagnostic : "",
            solution: typeof d.solution === "string" ? d.solution : "",
            tags: Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === "string") : [],
          });
          setShowNew(true);
        }
      }
    } catch {
      /* brouillon illisible : on l'ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshCases() {
    const reqId = ++historyReqRef.current;
    try {
      const res = await fetch("/api/cases");
      const data = await res.json();
      if (historyReqRef.current !== reqId) return;
      if (res.ok) setCases(data.cases ?? []);
      else setError(data.error || "Erreur de chargement du carnet.");
    } catch {
      /* silencieux */
    }
  }

  async function handleStructure() {
    if (!rawNotes.trim() || structuring) return;
    const epoch = ++epochRef.current;
    setStructuring(true);
    setError(null);
    try {
      const res = await fetch("/api/cases/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: rawNotes }),
      });
      const data = await res.json();
      if (epochRef.current !== epoch) return;
      if (!res.ok) throw new Error(data.error || "Erreur lors de la structuration.");
      setDraft(data.draft);
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setStructuring(false);
    }
  }

  async function handleSaveCase() {
    if (!draft || saving) return;
    const epoch = epochRef.current;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'enregistrement.");
      if (epochRef.current === epoch) {
        setShowNew(false);
        setRawNotes("");
        setDraft(null);
      }
      refreshCases();
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer cette fiche ?")) return;
    try {
      const res = await fetch(`/api/cases?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la suppression.");
      }
      setAiResult(null); // les ids mis en avant peuvent ne plus exister
      refreshCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  async function handleAiSearch() {
    if (!aiQuery.trim() || aiSearching) return;
    const epoch = ++epochRef.current;
    setAiSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/cases/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery }),
      });
      const data = await res.json();
      if (epochRef.current !== epoch) return;
      if (!res.ok) throw new Error(data.error || "Erreur lors de la recherche.");
      setAiResult(data.result);
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setAiSearching(false);
    }
  }

  function cancelNew() {
    epochRef.current++;
    setShowNew(false);
    setRawNotes("");
    setDraft(null);
    setStructuring(false);
    setSaving(false);
  }

  function updateDraft<K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  // Fiches affichées : recherche IA prioritaire, sinon filtre local.
  const highlighted = new Set(aiResult?.casIds ?? []);
  const displayed = aiResult
    ? cases.filter((c) => highlighted.has(c.id))
    : cases.filter((c) => matchesFilter(c, filter));

  return (
    <div className="min-h-screen">
      <AppHeader
        actions={
          <button
            onClick={() => {
              setShowNew(true);
              setAiResult(null);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            + Nouveau cas
          </button>
        }
      />

      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
        {/* Nouveau cas */}
        {showNew && (
          <section className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Nouveau cas de dépannage</h2>
              <button
                onClick={cancelNew}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Annuler
              </button>
            </div>

            {!draft ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="rawNotes" className="text-xs text-slate-500">
                    Décris le cas en vrac — l&apos;IA structure la fiche
                  </label>
                  <button
                    onClick={() => setRawNotes(EXEMPLE)}
                    className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                  >
                    Charger un exemple
                  </button>
                </div>
                <textarea
                  id="rawNotes"
                  value={rawNotes}
                  onChange={(e) => setRawNotes(e.target.value)}
                  rows={3}
                  placeholder="ex : huawei erreur 206 string 4, fusible dc hs, remplacé 15A, ok"
                  className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                <button
                  onClick={handleStructure}
                  disabled={structuring || !rawNotes.trim()}
                  className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {structuring ? "Structuration…" : "Structurer la fiche"}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-400">
                  Relis et corrige la fiche si besoin, puis enregistre.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Marque" value={draft.marque} onChange={(v) => updateDraft("marque", v)} />
                  <Field label="Matériel" value={draft.materiel} onChange={(v) => updateDraft("materiel", v)} />
                  <Field label="Code erreur" value={draft.codeErreur} onChange={(v) => updateDraft("codeErreur", v)} />
                </div>
                <FieldArea label="Symptôme" value={draft.symptome} onChange={(v) => updateDraft("symptome", v)} />
                <FieldArea label="Diagnostic" value={draft.diagnostic} onChange={(v) => updateDraft("diagnostic", v)} />
                <FieldArea label="Solution" value={draft.solution} onChange={(v) => updateDraft("solution", v)} />
                <Field
                  label="Tags (séparés par des virgules)"
                  value={draft.tags.join(", ")}
                  onChange={(v) =>
                    updateDraft(
                      "tags",
                      v.split(",").map((t) => t.trim()).filter(Boolean),
                    )
                  }
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveCase}
                    disabled={saving}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving ? "Enregistrement…" : "Enregistrer dans le carnet"}
                  </button>
                  <button
                    onClick={() => setDraft(null)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    ← Revenir à la note
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Recherche */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="filter" className="mb-1 block text-xs font-medium text-slate-500">
                Filtre instantané
              </label>
              <input
                id="filter"
                type="search"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setAiResult(null);
                }}
                placeholder="ex : huawei 206, fusible, isolement…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label htmlFor="aiQuery" className="mb-1 block text-xs font-medium text-slate-500">
                Recherche IA — pose ta question, la réponse s&apos;appuie sur tes fiches
              </label>
              <div className="flex gap-2">
                <input
                  id="aiQuery"
                  type="text"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAiSearch();
                  }}
                  placeholder="ex : qu'est-ce que j'avais fait sur l'erreur 206 Huawei ?"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                <button
                  onClick={handleAiSearch}
                  disabled={aiSearching || !aiQuery.trim()}
                  className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {aiSearching ? "Recherche…" : "Chercher"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Réponse IA */}
        {aiResult && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-amber-800">Réponse d&apos;après ton carnet</h3>
              <button
                onClick={() => setAiResult(null)}
                className="text-xs text-amber-600 hover:text-amber-800"
              >
                Effacer
              </button>
            </div>
            <p className="whitespace-pre-line text-sm text-slate-700">{aiResult.reponse}</p>
            {aiResult.casIds.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                {aiResult.casIds.length} fiche{aiResult.casIds.length > 1 ? "s" : ""} pertinente
                {aiResult.casIds.length > 1 ? "s" : ""} affichée{aiResult.casIds.length > 1 ? "s" : ""} ci-dessous.
              </p>
            )}
          </section>
        )}

        {/* Liste des fiches */}
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {aiResult ? "Fiches pertinentes" : "Fiches"} ({displayed.length}
            {!aiResult && filter && ` / ${cases.length}`})
          </h2>
          <div className="flex flex-col gap-2">
            {displayed.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white/50 p-8 text-center text-sm text-slate-400">
                {cases.length === 0
                  ? "Le carnet est vide. Ajoute ton premier cas avec « + Nouveau cas » — au fil du temps, il devient ta base de connaissances personnelle."
                  : "Aucune fiche ne correspond."}
              </p>
            )}
            {displayed.map((c) => (
              <details
                key={c.id}
                className={`group rounded-xl border bg-white shadow-sm transition ${
                  highlighted.has(c.id) ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
                }`}
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
                  {c.codeErreur && (
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-white">
                      {c.codeErreur}
                    </code>
                  )}
                  <span className="text-sm font-medium text-slate-800">
                    {[c.marque, c.materiel].filter(Boolean).join(" ") || "Équipement non précisé"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-500">{c.symptome}</span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(c.createdAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-slate-100 p-3 pl-4">
                  <MiniBlock title="Symptôme">{c.symptome || "—"}</MiniBlock>
                  <MiniBlock title="Diagnostic">{c.diagnostic || "—"}</MiniBlock>
                  <MiniBlock title="Solution">{c.solution || "—"}</MiniBlock>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.tags.map((t, i) => (
                      <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        #{t}
                      </span>
                    ))}
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="ml-auto rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function FieldArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function MiniBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h4>
      <p className="whitespace-pre-line text-sm text-slate-700">{children}</p>
    </div>
  );
}
