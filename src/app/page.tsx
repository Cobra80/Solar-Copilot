"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import DomainSelector, { useDomaine } from "@/components/DomainSelector";
import { DOMAINE_EXEMPLES } from "@/lib/domains";
import type { Intervention, Report, Statut, ProductionRetablie } from "@/lib/types";

const STATUT_STYLES: Record<Statut, string> = {
  "résolu": "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  "à suivre": "bg-amber-100 text-amber-800 ring-amber-600/20",
  "en attente de pièces": "bg-orange-100 text-orange-800 ring-orange-600/20",
  "non résolu": "bg-rose-100 text-rose-800 ring-rose-600/20",
};

const PRODUCTION_LABEL: Record<ProductionRetablie, string> = {
  oui: "Production rétablie",
  non: "Production non rétablie",
  inconnu: "Production : état inconnu",
};

export default function Home() {
  const router = useRouter();
  const [domaine, setDomaine] = useDomaine();
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Intervention[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [carnetAdding, setCarnetAdding] = useState(false);

  // « Époque » de l'affichage : incrémentée à chaque action qui change le rapport
  // affiché (génération, chargement, nouveau). Les réponses asynchrones capturent
  // l'époque à leur départ et sont ignorées si elle a changé entre-temps —
  // une réponse en retard ne peut plus écraser l'état d'un autre rapport.
  const epochRef = useRef(0);
  // Numéro de la dernière requête d'historique : seule la plus récente s'applique.
  const historyReqRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    refreshHistory();
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshHistory() {
    const reqId = ++historyReqRef.current;
    try {
      const res = await fetch("/api/interventions");
      const data = await res.json();
      if (historyReqRef.current !== reqId) return; // réponse périmée
      if (res.ok) setHistory(data.interventions ?? []);
    } catch {
      /* silencieux : l'historique n'est pas critique */
    }
  }

  async function handleGenerate() {
    if (!notes.trim() || loading) return;
    const epoch = ++epochRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, domaine }),
      });
      const data = await res.json();
      if (epochRef.current !== epoch) return; // l'utilisateur a changé de contexte
      if (!res.ok) throw new Error(data.error || "Erreur lors de la génération.");
      // On ne remplace l'affichage qu'en cas de succès : un échec conserve
      // le rapport précédent à l'écran.
      setReport(data.report);
      setEmail(null);
      setSaved(false);
      setLoadedId(null);
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setLoading(false);
    }
  }

  async function handleSave() {
    if (!report || saved || saving) return;
    const epoch = epochRef.current;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, report }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'enregistrement.");
      if (epochRef.current === epoch) {
        setSaved(true);
        setLoadedId(data.intervention?.id ?? null);
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

  async function handleEmail() {
    if (!report || emailLoading) return;
    const epoch = epochRef.current;
    setEmailLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, domaine }),
      });
      const data = await res.json();
      if (epochRef.current !== epoch) return; // le rapport affiché a changé
      if (!res.ok) throw new Error(data.error || "Erreur lors de la rédaction de l'email.");
      setEmail(data.email);
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setEmailLoading(false);
    }
  }

  function loadIntervention(item: Intervention) {
    epochRef.current++; // invalide les requêtes en vol
    setNotes(item.notes);
    setReport(item.report);
    setEmail(null);
    setError(null);
    setSaved(true);
    setLoadedId(item.id);
    setLoading(false);
    setSaving(false);
    setEmailLoading(false);
  }

  async function handleDelete(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Supprimer cette intervention ?")) return;
    try {
      const res = await fetch(`/api/interventions?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la suppression.");
      }
      // Si l'intervention supprimée est celle affichée, le rapport à l'écran
      // n'est plus enregistré nulle part : on réactive « Enregistrer ».
      if (id === loadedId) {
        setSaved(false);
        setLoadedId(null);
      }
      refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  /**
   * Convertit le rapport affiché en fiche de dépannage (via l'IA) et bascule
   * vers le carnet avec le brouillon pré-rempli (transmis par sessionStorage).
   */
  async function handleAddToCarnet() {
    if (!report || carnetAdding) return;
    const epoch = epochRef.current;
    setCarnetAdding(true);
    setError(null);
    try {
      const texte = [
        `Rapport d'intervention : ${report.titre}`,
        report.site && `Site : ${report.site}`,
        report.materiel.length > 0 && `Matériel : ${report.materiel.join(", ")}`,
        `Constat : ${report.constat}`,
        report.actionsRealisees.length > 0 &&
          `Actions réalisées : ${report.actionsRealisees.join(" ; ")}`,
        report.piecesRemplacees.length > 0 &&
          `Pièces remplacées : ${report.piecesRemplacees.join(" ; ")}`,
        report.recommandations.length > 0 &&
          `Recommandations : ${report.recommandations.join(" ; ")}`,
        `Statut : ${report.statut} — production : ${report.productionRetablie}`,
        notes.trim() && `Notes brutes d'origine : ${notes}`,
      ]
        .filter(Boolean)
        .join("\n");

      const res = await fetch("/api/cases/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: texte, domaine }),
      });
      const data = await res.json();
      if (epochRef.current !== epoch) return;
      if (!res.ok) throw new Error(data.error || "Erreur lors de la conversion en fiche.");
      sessionStorage.setItem("solar-copilot-carnet-draft", JSON.stringify(data.draft));
      router.push("/carnet");
    } catch (e) {
      if (epochRef.current === epoch) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    } finally {
      if (epochRef.current === epoch) setCarnetAdding(false);
    }
  }

  function newReport() {
    epochRef.current++; // invalide les requêtes en vol
    setNotes("");
    setReport(null);
    setEmail(null);
    setError(null);
    setSaved(false);
    setLoadedId(null);
    setLoading(false);
    setSaving(false);
    setEmailLoading(false);
  }

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard non disponible */
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader
        actions={
          <button
            onClick={newReport}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            + Nouveau
          </button>
        }
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[260px_1fr] print:block print:max-w-none print:p-0">
        {/* Historique */}
        <aside className="no-print md:sticky md:top-20 md:h-fit">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Historique ({history.length})
          </h2>
          <div className="flex flex-col gap-1.5">
            {history.length === 0 && (
              <p className="px-1 text-sm text-slate-400">Aucune intervention enregistrée.</p>
            )}
            {history.map((item) => (
              <div
                key={item.id}
                onClick={() => loadIntervention(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    loadIntervention(item);
                  }
                }}
                className="group flex cursor-pointer items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {item.report.titre || "Sans titre"}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <button
                  onClick={(e) => handleDelete(item.id, e)}
                  className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  title="Supprimer"
                  aria-label={`Supprimer « ${item.report.titre || "Sans titre"} »`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Zone principale */}
        <main className="flex flex-col gap-6 print:block">
          {/* Saisie des notes */}
          <section className="no-print rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="notes" className="text-sm font-medium text-slate-700">
                Notes de terrain
              </label>
              <div className="flex items-center gap-3">
                <DomainSelector value={domaine} onChange={setDomaine} />
                <button
                  onClick={() => setNotes(DOMAINE_EXEMPLES[domaine].rapport)}
                  className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                >
                  Charger un exemple
                </button>
              </div>
            </div>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder={`Colle ici tes notes brutes… ex : ${DOMAINE_EXEMPLES[domaine].rapport}`}
              className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading || !notes.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Génération…" : "Générer le rapport"}
              </button>
              {loading && (
                <span className="text-sm text-slate-400">Le modèle rédige le rapport…</span>
              )}
            </div>
          </section>

          {error && (
            <div className="no-print rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Rapport */}
          {report && (
            <>
              <section
                id="report-print"
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{report.titre}</h2>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      {report.site && <span>📍 {report.site}</span>}
                      {report.date && <span>🗓️ {report.date}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUT_STYLES[report.statut] ?? "bg-slate-100 text-slate-700 ring-slate-600/20"}`}
                    >
                      {report.statut}
                    </span>
                    <span className="text-xs text-slate-400">
                      {PRODUCTION_LABEL[report.productionRetablie] ?? ""}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-4">
                  <Block title="Constat">
                    <p className="whitespace-pre-line text-sm text-slate-700">
                      {report.constat || "—"}
                    </p>
                  </Block>

                  {report.materiel.length > 0 && (
                    <Block title="Matériel concerné">
                      <ul className="flex flex-wrap gap-2">
                        {report.materiel.map((m, i) => (
                          <li
                            key={i}
                            className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
                          >
                            {m}
                          </li>
                        ))}
                      </ul>
                    </Block>
                  )}

                  <ListBlock title="Actions réalisées" items={report.actionsRealisees} />
                  <ListBlock title="Pièces remplacées" items={report.piecesRemplacees} />
                  <ListBlock title="Recommandations" items={report.recommandations} />
                </div>
              </section>

              {/* Actions sur le rapport */}
              <div className="no-print flex flex-wrap gap-3">
                <button
                  onClick={handleSave}
                  disabled={saved || saving}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saved ? "✓ Enregistré" : saving ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button
                  onClick={() => window.print()}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Exporter en PDF
                </button>
                <button
                  onClick={handleEmail}
                  disabled={emailLoading}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {emailLoading ? "Rédaction…" : "Générer l'email client"}
                </button>
                <button
                  onClick={handleAddToCarnet}
                  disabled={carnetAdding}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Convertit ce rapport en fiche de dépannage pré-remplie"
                >
                  {carnetAdding ? "Conversion…" : "📓 Ajouter au carnet"}
                </button>
              </div>

              {/* Email client */}
              {email && (
                <section className="no-print rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Email client</h3>
                    <button
                      onClick={copyEmail}
                      className="text-xs font-medium text-amber-600 hover:text-amber-700"
                    >
                      {copied ? "Copié ✓" : "Copier"}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">
                    {email}
                  </pre>
                </section>
              )}
            </>
          )}

          {!report && !loading && (
            <div className="no-print rounded-xl border border-dashed border-slate-300 bg-white/50 p-10 text-center text-sm text-slate-400">
              Saisis tes notes de terrain puis génère un rapport propre, prêt à exporter en PDF
              ou à envoyer au client.
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

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Block title={title}>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Block>
  );
}
