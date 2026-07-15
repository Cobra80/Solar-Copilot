"use client";

import { useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import type { Tache, TacheDraft } from "@/lib/types";

const EXEMPLE_DUMP =
  "aujourd'hui rappeler transfo lab pour savoir où en sont les analyses d'huile pour Hypercourt, demain voir avec Henri pour régler le problème Teepee et finir le rapport Hypercourt (une fois que j'ai tout pour Hypercourt, envoyer à Wilfried de Valemo), demain formation extincteur en distanciel avec JC, et je suis en intervention sur SPDJ, rapport à faire vendredi en rentrant";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatEcheance(s: string): string {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

type Groupe = { cle: string; titre: string; couleur: string; taches: Tache[] };

function grouper(taches: Tache[]): Groupe[] {
  const today = todayISO();
  const g: Record<string, Tache[]> = { retard: [], aujourdhui: [], avenir: [], sansdate: [], fait: [] };
  for (const t of taches) {
    if (t.fait) g.fait.push(t);
    else if (!t.echeance) g.sansdate.push(t);
    else if (t.echeance < today) g.retard.push(t);
    else if (t.echeance === today) g.aujourdhui.push(t);
    else g.avenir.push(t);
  }
  return [
    { cle: "retard", titre: "En retard", couleur: "text-rose-600", taches: g.retard },
    { cle: "aujourdhui", titre: "Aujourd'hui", couleur: "text-amber-600", taches: g.aujourdhui },
    { cle: "avenir", titre: "À venir", couleur: "text-slate-600", taches: g.avenir },
    { cle: "sansdate", titre: "Sans échéance", couleur: "text-slate-400", taches: g.sansdate },
    { cle: "fait", titre: "Terminé", couleur: "text-slate-400", taches: g.fait },
  ].filter((grp) => grp.taches.length > 0);
}

export default function TachesPage() {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [titre, setTitre] = useState("");
  const [echeance, setEcheance] = useState("");
  const [adding, setAdding] = useState(false);

  const [showDump, setShowDump] = useState(false);
  const [dumpText, setDumpText] = useState("");
  const [dumping, setDumping] = useState(false);
  const [drafts, setDrafts] = useState<TacheDraft[] | null>(null);
  const [addingDrafts, setAddingDrafts] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [editEcheance, setEditEcheance] = useState("");
  const [editNote, setEditNote] = useState("");

  const reqRef = useRef(0);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const reqId = ++reqRef.current;
    try {
      const res = await fetch("/api/todos");
      const data = await res.json();
      if (reqRef.current !== reqId) return;
      if (res.ok) setTaches(data.taches ?? []);
      else setError(data.error || "Erreur de chargement.");
    } catch {
      /* silencieux */
    }
  }

  async function addQuick() {
    const t = titre.trim();
    if (!t || adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre: t, echeance }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'ajout.");
      setTitre("");
      setEcheance("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleDone(t: Tache) {
    // Optimiste : on bascule localement, puis on confirme côté serveur.
    setTaches((prev) => prev.map((x) => (x.id === t.id ? { ...x, fait: !x.fait } : x)));
    try {
      const res = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, patch: { fait: !t.fait } }),
      });
      if (!res.ok) throw new Error();
      refresh();
    } catch {
      refresh(); // resynchronise en cas d'échec
    }
  }

  async function removeTache(id: string) {
    setTaches((prev) => prev.filter((x) => x.id !== id));
    try {
      await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
    } finally {
      refresh();
    }
  }

  function startEdit(t: Tache) {
    setEditId(t.id);
    setEditTitre(t.titre);
    setEditEcheance(t.echeance);
    setEditNote(t.note);
  }

  async function saveEdit() {
    if (!editId || !editTitre.trim()) return;
    const id = editId;
    setEditId(null);
    try {
      const res = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          patch: { titre: editTitre.trim(), echeance: editEcheance, note: editNote },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur.");
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
      refresh();
    }
  }

  async function handleDump() {
    if (!dumpText.trim() || dumping) return;
    setDumping(true);
    setError(null);
    setDrafts(null);
    try {
      const res = await fetch("/api/todos/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: dumpText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors du découpage.");
      setDrafts(data.taches ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setDumping(false);
    }
  }

  async function addAllDrafts() {
    if (!drafts || drafts.length === 0 || addingDrafts) return;
    setAddingDrafts(true);
    setError(null);
    try {
      for (const d of drafts) {
        await fetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        });
      }
      setDrafts(null);
      setDumpText("");
      setShowDump(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
      refresh();
    } finally {
      setAddingDrafts(false);
    }
  }

  const groupes = grouper(taches);
  const nbAFaire = taches.filter((t) => !t.fait).length;

  return (
    <div className="min-h-screen">
      <AppHeader />

      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
        {/* Ajout rapide */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addQuick();
              }}
              placeholder="Une tâche à ne pas oublier…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <input
              type="date"
              value={echeance}
              onChange={(e) => setEcheance(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <button
              onClick={addQuick}
              disabled={adding || !titre.trim()}
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ajouter
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-slate-400">Échéance rapide :</span>
            <button onClick={() => setEcheance(todayISO())} className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 hover:bg-slate-200">
              Aujourd&apos;hui
            </button>
            <button onClick={() => setEcheance(addDaysISO(1))} className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 hover:bg-slate-200">
              Demain
            </button>
            <button onClick={() => setEcheance("")} className="rounded px-2 py-0.5 text-slate-400 hover:text-slate-600">
              Sans date
            </button>
            <button
              onClick={() => setShowDump((v) => !v)}
              className="ml-auto rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              ✨ Coller un pavé
            </button>
          </div>

          {/* Découpage IA */}
          {showDump && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="mb-2 text-xs text-amber-800">
                Colle ce qu&apos;on t&apos;a demandé, en vrac — l&apos;IA le découpe en tâches datées.
              </p>
              <textarea
                value={dumpText}
                onChange={(e) => setDumpText(e.target.value)}
                rows={3}
                placeholder="ex : demain rappeler X pour…, finir le rapport Y, formation avec Z vendredi…"
                className="w-full resize-y rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDump}
                  disabled={dumping || !dumpText.trim()}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {dumping ? "Découpage…" : "Découper en tâches"}
                </button>
                <button
                  onClick={() => setDumpText(EXEMPLE_DUMP)}
                  className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                >
                  Charger un exemple
                </button>
              </div>

              {/* Aperçu des tâches détectées */}
              {drafts && (
                <div className="mt-3">
                  {drafts.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucune tâche détectée dans ce texte.</p>
                  ) : (
                    <>
                      <p className="mb-1.5 text-xs font-semibold text-slate-600">
                        {drafts.length} tâche{drafts.length > 1 ? "s" : ""} détectée{drafts.length > 1 ? "s" : ""} :
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {drafts.map((d, i) => (
                          <li key={i} className="flex items-start gap-2 rounded-lg bg-white p-2 text-sm ring-1 ring-slate-200">
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-slate-800">{d.titre}</span>
                              {d.note && <span className="block text-xs text-slate-500">{d.note}</span>}
                            </div>
                            {d.echeance && (
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                                {formatEcheance(d.echeance)}
                              </span>
                            )}
                            <button
                              onClick={() => setDrafts((prev) => prev?.filter((_, j) => j !== i) ?? null)}
                              className="shrink-0 text-slate-300 hover:text-rose-500"
                              aria-label="Retirer"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={addAllDrafts}
                        disabled={addingDrafts}
                        className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-40"
                      >
                        {addingDrafts ? "Ajout…" : `Ajouter ${drafts.length} tâche${drafts.length > 1 ? "s" : ""}`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Liste */}
        {taches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 p-10 text-center text-sm text-slate-400">
            Rien à faire pour l&apos;instant. Note ce que tu ne veux pas oublier ci-dessus — ou colle
            un pavé de consignes, l&apos;IA le range en tâches.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {nbAFaire === 0 && (
              <p className="text-sm text-emerald-600">🎉 Tout est fait — rien en attente.</p>
            )}
            {groupes.map((grp) => (
              <section key={grp.cle}>
                <h2 className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${grp.couleur}`}>
                  {grp.titre} ({grp.taches.length})
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {grp.taches.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-slate-200 bg-white shadow-sm"
                    >
                      {editId === t.id ? (
                        <div className="flex flex-col gap-2 p-3">
                          <input
                            type="text"
                            value={editTitre}
                            onChange={(e) => setEditTitre(e.target.value)}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          />
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="date"
                              value={editEcheance}
                              onChange={(e) => setEditEcheance(e.target.value)}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                            />
                            <input
                              type="text"
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              placeholder="Note (facultatif)"
                              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                              Enregistrer
                            </button>
                            <button onClick={() => setEditId(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="group flex items-start gap-3 p-3">
                          <button
                            onClick={() => toggleDone(t)}
                            role="checkbox"
                            aria-checked={t.fait}
                            aria-label={t.fait ? "Marquer non faite" : "Marquer comme faite"}
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                              t.fait
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-slate-300 hover:border-emerald-400"
                            }`}
                          >
                            {t.fait && <span className="text-xs leading-none">✓</span>}
                          </button>
                          <div className="min-w-0 flex-1">
                            <span
                              className={`text-sm ${t.fait ? "text-slate-400 line-through" : "text-slate-800"}`}
                            >
                              {t.titre}
                            </span>
                            {t.note && (
                              <span className="block text-xs text-slate-500">{t.note}</span>
                            )}
                          </div>
                          {t.echeance && (
                            <span
                              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs ${
                                grp.cle === "retard"
                                  ? "bg-rose-100 text-rose-700"
                                  : grp.cle === "aujourdhui"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {formatEcheance(t.echeance)}
                            </span>
                          )}
                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              onClick={() => startEdit(t)}
                              className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                              aria-label="Modifier"
                              title="Modifier"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => removeTache(t.id)}
                              className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                              aria-label="Supprimer"
                              title="Supprimer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
