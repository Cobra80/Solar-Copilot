"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import DomainSelector, { useDomaine } from "@/components/DomainSelector";
import { DOMAINE_EXEMPLES } from "@/lib/domains";
import type { Gravite, LogAnalysis, SanteGlobale } from "@/lib/types";

const GRAVITE_STYLES: Record<Gravite, string> = {
  critique: "bg-rose-100 text-rose-800 ring-rose-600/20",
  majeure: "bg-orange-100 text-orange-800 ring-orange-600/20",
  mineure: "bg-amber-100 text-amber-800 ring-amber-600/20",
  info: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const SANTE_STYLES: Record<SanteGlobale, { badge: string; label: string }> = {
  "bon": { badge: "bg-emerald-100 text-emerald-800 ring-emerald-600/20", label: "État : bon" },
  "à surveiller": { badge: "bg-amber-100 text-amber-800 ring-amber-600/20", label: "État : à surveiller" },
  "dégradé": { badge: "bg-orange-100 text-orange-800 ring-orange-600/20", label: "État : dégradé" },
  "critique": { badge: "bg-rose-100 text-rose-800 ring-rose-600/20", label: "État : critique" },
};

/**
 * Lecture robuste des fichiers de logs : les exports constructeurs (SMA
 * notamment) sont souvent en UTF-16 (BOM) ou Windows-1252 plutôt qu'en UTF-8.
 */
async function readFileSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function LogsPage() {
  const [domaine, setDomaine] = useDomaine();
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Même principe que sur la page rapport : une réponse partie avant un
  // changement de contexte (nouveau fichier, reset) est ignorée.
  const epochRef = useRef(0);

  async function loadFile(file: File) {
    epochRef.current++;
    setError(null);
    setAnalysis(null);
    setAnalyzing(false);
    try {
      const text = await readFileSmart(file);
      const lines = text.split(/\r?\n/).length;
      setContent(text);
      setFileName(file.name);
      setFileInfo(`${formatSize(file.size)} · ${lines.toLocaleString("fr-FR")} lignes`);
    } catch {
      setError("Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un fichier texte (CSV, log, txt).");
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = ""; // permet de recharger le même fichier
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  function handlePaste(text: string) {
    epochRef.current++;
    setContent(text);
    setFileName(null);
    setFileInfo(null);
    setAnalysis(null);
    setAnalyzing(false);
    setError(null);
  }

  function reset() {
    epochRef.current++;
    setContent("");
    setFileName(null);
    setFileInfo(null);
    setAnalysis(null);
    setTruncated(false);
    setError(null);
    setAnalyzing(false);
  }

  async function handleAnalyze() {
    if (!content.trim() || analyzing) return;
    const epoch = ++epochRef.current;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, filename: fileName ?? undefined, domaine }),
      });
      const data = await res.json();
      if (epochRef.current !== epoch) return;
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'analyse.");
      setAnalysis(data.analysis);
      setTruncated(Boolean(data.truncated));
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setAnalyzing(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader
        actions={
          <button
            onClick={reset}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            + Nouvelle analyse
          </button>
        }
      />

      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 print:block print:max-w-none print:p-0">
        {/* Import */}
        <section className="no-print rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-700">
              Logs — {DOMAINE_EXEMPLES[domaine].logsHint}
            </h2>
            <DomainSelector value={domaine} onChange={setDomaine} />
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${
              dragOver
                ? "border-amber-400 bg-amber-50"
                : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
            }`}
          >
            <span className="text-2xl">📄</span>
            {fileName ? (
              <>
                <span className="text-sm font-medium text-slate-800">{fileName}</span>
                <span className="text-xs text-slate-400">{fileInfo}</span>
                <span className="text-xs text-slate-400">Clique ou dépose un fichier pour remplacer</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-slate-700">
                  Dépose un fichier ici ou clique pour choisir
                </span>
                <span className="text-xs text-slate-400">CSV, log, txt — encodages UTF-8/UTF-16/ANSI gérés</span>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.log,.txt,.tsv,.dat"
            onChange={handleFileChange}
            className="hidden"
          />

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
              …ou colle directement le contenu des logs
            </summary>
            <textarea
              value={fileName ? "" : content}
              onChange={(e) => handlePaste(e.target.value)}
              rows={6}
              placeholder="Colle ici le contenu brut de tes logs…"
              className="mt-2 w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-xs text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </details>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !content.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {analyzing ? "Analyse…" : "Analyser les logs"}
            </button>
            {analyzing && (
              <span className="text-sm text-slate-400">Le modèle passe les logs au crible…</span>
            )}
          </div>
        </section>

        {error && (
          <div className="no-print rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Résultat */}
        {analysis && (
          <>
            <section
              id="report-print"
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Analyse des logs</h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    {fileName && <span>📄 {fileName}</span>}
                    {analysis.periode && <span>🗓️ {analysis.periode}</span>}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${SANTE_STYLES[analysis.santeGlobale]?.badge ?? "bg-slate-100 text-slate-700 ring-slate-600/20"}`}
                >
                  {SANTE_STYLES[analysis.santeGlobale]?.label ?? analysis.santeGlobale}
                </span>
              </div>

              {truncated && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Fichier volumineux : l&apos;analyse porte sur un extrait filtré (début + lignes
                  d&apos;erreur/alarme + fin). Les comptages sont donc des minima.
                </p>
              )}

              <div className="mt-4 flex flex-col gap-5">
                <Block title="Résumé">
                  <p className="whitespace-pre-line text-sm text-slate-700">{analysis.resume}</p>
                </Block>

                {analysis.equipements.length > 0 && (
                  <Block title="Équipements identifiés">
                    <ul className="flex flex-wrap gap-2">
                      {analysis.equipements.map((eq, i) => (
                        <li key={i} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          {eq}
                        </li>
                      ))}
                    </ul>
                  </Block>
                )}

                {analysis.erreurs.length > 0 && (
                  <Block title={`Erreurs détectées (${analysis.erreurs.length})`}>
                    <div className="flex flex-col gap-2">
                      {analysis.erreurs.map((err, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {err.code && (
                              <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-white">
                                {err.code}
                              </code>
                            )}
                            <span className="text-sm font-medium text-slate-800">{err.libelle}</span>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${GRAVITE_STYLES[err.gravite] ?? GRAVITE_STYLES.info}`}
                            >
                              {err.gravite}
                            </span>
                            <span className="ml-auto text-xs text-slate-400">
                              ×{err.occurrences}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm text-slate-600">{err.description}</p>
                          {err.actionRecommandee && (
                            <p className="mt-1 text-sm text-slate-700">
                              <span className="font-medium">→ Action :</span> {err.actionRecommandee}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Block>
                )}

                {analysis.anomalies.length > 0 && (
                  <Block title="Anomalies et motifs suspects">
                    <div className="flex flex-col gap-2">
                      {analysis.anomalies.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
                          <span
                            className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${GRAVITE_STYLES[a.gravite] ?? GRAVITE_STYLES.info}`}
                          >
                            {a.gravite}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{a.titre}</p>
                            <p className="text-sm text-slate-600">{a.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Block>
                )}

                {analysis.recommandations.length > 0 && (
                  <Block title="Recommandations">
                    <ul className="flex flex-col gap-1.5">
                      {analysis.recommandations.map((r, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-700">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </Block>
                )}
              </div>
            </section>

            <div className="no-print flex flex-wrap gap-3">
              <button
                onClick={() => window.print()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Exporter en PDF
              </button>
            </div>
          </>
        )}

        {!analysis && !analyzing && (
          <div className="no-print rounded-xl border border-dashed border-slate-300 bg-white/50 p-10 text-center text-sm text-slate-400">
            Charge un export de logs onduleur : l&apos;analyse regroupe les erreurs, repère les
            anomalies et te donne des recommandations concrètes.
          </div>
        )}
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
