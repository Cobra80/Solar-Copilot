"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import AppHeader from "@/components/AppHeader";
import type { DocAnswer, DocMeta, DocType } from "@/lib/types";

const TYPE_ICON: Record<DocType, string> = {
  pdf: "📕",
  docx: "📘",
  texte: "📄",
  image: "🖼️",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function CerveauPage() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Import
  const [uploading, setUploading] = useState<string | null>(null); // nom du fichier en cours
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Question
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<DocAnswer | null>(null);

  const epochRef = useRef(0);
  const listReqRef = useRef(0);

  useEffect(() => {
    refreshDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshDocs() {
    const reqId = ++listReqRef.current;
    try {
      const res = await fetch("/api/docs");
      const data = await res.json();
      if (listReqRef.current !== reqId) return;
      if (res.ok) setDocs(data.docs ?? []);
      else setError(data.error || "Erreur de chargement de la bibliothèque.");
    } catch {
      /* silencieux */
    }
  }

  async function uploadFile(file: File) {
    if (uploading) return;
    setUploading(file.name);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/docs", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'import.");
      refreshDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setUploading(null);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function handleAsk() {
    if (!question.trim() || asking) return;
    const epoch = ++epochRef.current;
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/docs/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (epochRef.current !== epoch) return;
      if (!res.ok) throw new Error(data.error || "Erreur lors de la recherche.");
      setAnswer(data.result);
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setAsking(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer ce document de la bibliothèque ?")) return;
    try {
      const res = await fetch(`/api/docs?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la suppression.");
      }
      setAnswer(null); // les sources citées peuvent ne plus exister
      refreshDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  // Sources citées : documents de la bibliothèque + le carnet (id réservé "carnet").
  const sources = answer
    ? answer.docIds
        .map((id) => {
          if (id === "carnet") return { id, label: "📓 Carnet de dépannage" };
          const doc = docs.find((d) => d.id === id);
          return doc ? { id, label: `${TYPE_ICON[doc.type]} ${doc.nom}` } : null;
        })
        .filter((s): s is { id: string; label: string } => s !== null)
    : [];

  return (
    <div className="min-h-screen">
      <AppHeader />

      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
        {/* Question */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label htmlFor="question" className="mb-1 block text-sm font-medium text-slate-700">
            Pose une question à tes documents et à ton carnet de dépannage
          </label>
          <div className="flex gap-2">
            <input
              id="question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAsk();
              }}
              placeholder="ex : quelle est la procédure pour remplacer un sectionneur ?"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <button
              onClick={handleAsk}
              disabled={asking || !question.trim()}
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {asking ? "Recherche…" : "Demander"}
            </button>
          </div>
          {asking && (
            <p className="mt-2 text-sm text-slate-400">
              Le modèle sélectionne les documents pertinents puis rédige la réponse…
            </p>
          )}
        </section>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Réponse */}
        {answer && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-amber-800">Réponse d&apos;après tes documents</h3>
              <button
                onClick={() => setAnswer(null)}
                className="text-xs text-amber-600 hover:text-amber-800"
              >
                Effacer
              </button>
            </div>
            <p className="whitespace-pre-line text-sm text-slate-700">{answer.reponse}</p>
            {sources.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-amber-700">Sources :</span>
                {sources.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-amber-200"
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Import */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-slate-700">Ajouter un document</h2>
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !uploading) {
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
            {uploading ? (
              <>
                <span className="text-2xl">⏳</span>
                <span className="text-sm font-medium text-slate-700">
                  Import de « {uploading} »…
                </span>
                <span className="text-xs text-slate-400">
                  Extraction du texte + indexation (quelques secondes à une minute)
                </span>
              </>
            ) : (
              <>
                <span className="text-2xl">📚</span>
                <span className="text-sm font-medium text-slate-700">
                  Dépose un document ici ou clique pour choisir
                </span>
                <span className="text-xs text-slate-400">
                  PDF (y compris scannés), Word (.docx), photos (JPG/PNG), texte — max 15 Mo
                </span>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv,.log,.jpg,.jpeg,.png,.webp,.gif"
            onChange={handleFileChange}
            className="hidden"
          />
        </section>

        {/* Bibliothèque */}
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Bibliothèque ({docs.length})
          </h2>
          <div className="flex flex-col gap-2">
            {docs.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white/50 p-8 text-center text-sm text-slate-400">
                La bibliothèque est vide. Ajoute tes notices, procédures et rapports — tu pourras
                ensuite les interroger en langage naturel.
              </p>
            )}
            {docs.map((d) => (
              <details
                key={d.id}
                className="group rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
                  <span className="text-lg">{TYPE_ICON[d.type] ?? "📄"}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {d.nom}
                  </span>
                  {d.tronque && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                      tronqué
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatSize(d.taille)} ·{" "}
                    {new Date(d.createdAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                </summary>
                <div className="flex flex-col gap-2 border-t border-slate-100 p-3 pl-4">
                  <p className="text-sm text-slate-600">{d.resume}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {d.motsCles.map((t, i) => (
                      <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        #{t}
                      </span>
                    ))}
                    <button
                      onClick={() => handleDelete(d.id)}
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
