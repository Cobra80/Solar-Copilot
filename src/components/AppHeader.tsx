"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

async function handleLogout() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {
    /* on redirige quand même */
  }
  window.location.href = "/login";
}

const TABS = [
  { href: "/", label: "Rapport" },
  { href: "/logs", label: "Analyse de logs" },
  { href: "/carnet", label: "Carnet" },
  { href: "/cerveau", label: "Cerveau" },
  { href: "/procedures", label: "Procédures" },
];

export default function AppHeader({ actions }: { actions?: ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">☀️</span>
          <div>
            <h1 className="text-lg font-semibold leading-none text-slate-900">Solar Copilot</h1>
            <p className="text-xs text-slate-500">Boîte à outils O&amp;M électrotechnique · PV · HTA · HTB</p>
          </div>
        </div>
        <nav className="order-last w-full overflow-x-auto rounded-lg bg-slate-100 p-1 md:order-none md:w-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  pathname === tab.href
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="flex items-center gap-2">
          {actions}
          <button
            onClick={handleLogout}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
