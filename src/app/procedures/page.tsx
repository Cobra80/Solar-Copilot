"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import type { DocMeta, Procedure, ProcedureRecord } from "@/lib/types";

const EXEMPLE = "Remplacement d'un optimiseur SolarEdge sur toiture inclinée";

export default function ProceduresPage() {
  const [demande, setDemande] = useState("");
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [docs, setDocs] = useState<DocMeta[]>([]); // pour afficher le nom des sources
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProcedureRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const epochRef = useRef(0);
  const historyReqRef = useRef(0);

  useEffect(() => {
    refreshHistory();
    fetch("/api/docs")
      .then((r) => r.json())
      .then((d) => setDocs(d.docs ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshHistory() {
    const reqId = ++historyReqRef.current;
    try {
      const res = await fetch("/api/procedures");
      const data = await res.json();
      if (historyReqRef.current !== reqId) return;
      if (res.ok) setHistory(data.procedures ?? []);
    } catch {
      /* silencieux */
    }
  }

  async function handleGenerate() {
    if (!demande.trim() || generating) return;
    const epoch = ++epochRef.current;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/procedures/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demande }),
      });
      const data = await res.json();
      if (epochRef.current !== epoch) return;
      if (!res.ok) throw new Error(data.error || "Erreur lors de la génération.");
      setProcedure(data.procedure);
      setDocIds(data.docIds ?? []);
      setSaved(false);
      setLoadedId(null);
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setGenerating(false);
    }
  }

  async function handleSave() {
    if (!procedure || saved || saving) return;
    const epoch = epochRef.current;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/procedures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demande, procedure, docIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'enregistrement.");
      if (epochRef.current === epoch) {
        setSaved(true);
        setLoadedId(data.record?.id ?? null);
      }
      refreshHistory();
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setSaving(false);
    }
  }

  function loadRecord(record: ProcedureRecord) {
    epochRef.current++;
    setDemande(record.demande);
    setProcedure(record.procedure);
    setDocIds(record.docIds);
    setError(null);
    setSaved(true);
    setLoadedId(record.id);
    setGenerating(false);
    setSaving(false);
  }

  async function handleDelete(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Supprimer cette procédure ?")) return;
    try {
      const res = await fetch(`/api/procedures?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la suppression.");
      }
      if (id === loadedId) {
        setSaved(false);
        setLoadedId(null);
      }
      refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  function newProcedure() {
    epochRef.current++;
    setDemande("");
    setProcedure(null);
    setDocIds([]);
    setError(null);
    setSaved(false);
    setLoadedId(null);
    setGenerating(false);
    setSaving(false);
  }

  const sources = docIds
    .map((id) => {
      if (id === "carnet") return "📓 Carnet de dépannage";
      const doc = docs.find((d) => d.id === id);
      return doc ? doc.nom : null;
    })
    .filter((s): s is string => s !== null);

  return (
    <div className="min-h-screen">
      <AppHeader
        actions={
          <button
            onClick={newProcedure}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            + Nouvelle
          </button>
        }
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[260px_1fr] print:block print:max-w-none print:p-0">
        {/* Procédures enregistrées */}
        <aside className="no-print md:sticky md:top-20 md:h-fit">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mes procédures ({history.length})
          </h2>
          <div className="flex flex-col gap-1.5">
            {history.length === 0 && (
              <p className="px-1 text-sm text-slate-400">Aucune procédure enregistrée.</p>
            )}
            {history.map((record) => (
              <div
                key={record.id}
                onClick={() => loadRecord(record)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    loadRecord(record);
                  }
                }}
                className="group flex cursor-pointer items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {record.procedure.titre || "Sans titre"}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {new Date(record.createdAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                </span>
                <button
                  onClick={(e) => handleDelete(record.id, e)}
                  className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  title="Supprimer"
                  aria-label={`Supprimer « ${record.procedure.titre || "Sans titre"} »`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Zone principale */}
        <main className="flex flex-col gap-6 print:block">
          {/* Demande */}
          <section className="no-print rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="demande" className="text-sm font-medium text-slate-700">
                Décris la tâche
              </label>
              <button
                onClick={() => setDemande(EXEMPLE)}
                className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
              >
                Charger un exemple
              </button>
            </div>
            <textarea
              id="demande"
              value={demande}
              onChange={(e) => setDemande(e.target.value)}
              rows={2}
              placeholder="ex : remplacement d'un optimiseur SolarEdge sur toiture inclinée"
              className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={generating || !demande.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generating ? "Génération…" : "Générer la procédure"}
              </button>
              {generating && (
                <span className="text-sm text-slate-400">
                  Consultation de ta bibliothèque puis rédaction…
                </span>
              )}
            </div>
          </section>

          {error && (
            <div className="no-print rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Procédure */}
          {procedure && (
            <>
              <section
                id="report-print"
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-semibold text-slate-900">{procedure.titre}</h2>
                  <p className="mt-1 text-sm text-slate-600">{procedure.objectif}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    {procedure.dureeEstimee && <span>⏱️ {procedure.dureeEstimee}</span>}
                    {procedure.personnel && <span>👷 {procedure.personnel}</span>}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-5">
                  {procedure.epi.length > 0 && (
                    <Block title="EPI requis">
                      <ul className="flex flex-wrap gap-2">
                        {procedure.epi.map((e, i) => (
                          <li key={i} className="rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-800 ring-1 ring-inset ring-sky-200">
                            🦺 {e}
                          </li>
                        ))}
                      </ul>
                    </Block>
                  )}

                  {procedure.risques.length > 0 && (
                    <Block title="Risques et points de vigilance">
                      <ul className="flex flex-col gap-1.5">
                        {procedure.risques.map((r, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-700">
                            <span className="shrink-0">⚠️</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </Block>
                  )}

                  {procedure.materiel.length > 0 && (
                    <Block title="Matériel et outillage">
                      <ul className="flex flex-col gap-1.5">
                        {procedure.materiel.map((m, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-700">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </Block>
                  )}

                  {procedure.etapes.length > 0 && (
                    <Block title="Étapes">
                      <ol className="flex flex-col gap-3">
                        {procedure.etapes.map((etape, i) => (
                          <li key={i} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-baseline gap-2">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                                {i + 1}
                              </span>
                              <h4 className="text-sm font-semibold text-slate-800">{etape.titre}</h4>
                            </div>
                            <ul className="mt-2 flex flex-col gap-1 pl-8">
                              {etape.details.map((d, j) => (
                                <li key={j} className="flex gap-2 text-sm text-slate-700">
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                                  <span>{d}</span>
                                </li>
                              ))}
                            </ul>
                            {etape.attention && (
                              <p className="ml-8 mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                                ⚠️ {etape.attention}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </Block>
                  )}

                  {procedure.controlesFinaux.length > 0 && (
                    <Block title="Contrôles finaux">
                      <ul className="flex flex-col gap-1.5">
                        {procedure.controlesFinaux.map((c, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-700">
                            <span className="shrink-0">✅</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </Block>
                  )}

                  {sources.length > 0 && (
                    <Block title="Sources (ta bibliothèque)">
                      <ul className="flex flex-wrap gap-2">
                        {sources.map((s, i) => (
                          <li key={i} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {s}
                          </li>
                        ))}
                      </ul>
                    </Block>
                  )}

                  {procedure.avertissement && (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-500">
                      {procedure.avertissement}
                    </p>
                  )}
                </div>
              </section>

              <div className="no-print flex flex-wrap gap-3">
                <button
                  onClick={handleSave}
                  disabled={saved || saving}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saved ? "✓ Enregistrée" : saving ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button
                  onClick={() => window.print()}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Exporter en PDF
                </button>
              </div>
            </>
          )}

          {!procedure && !generating && (
            <div className="no-print rounded-xl border border-dashed border-slate-300 bg-white/50 p-10 text-center text-sm text-slate-400">
              Décris une tâche et génère une procédure complète : EPI, risques, matériel, étapes,
              contrôles. Si ta bibliothèque (Cerveau, Carnet) couvre le sujet, la procédure s&apos;appuie
              dessus et cite ses sources.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  );
}
