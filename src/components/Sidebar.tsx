"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SignOut } from "@/components/SignOut";
import { Merke } from "@/components/Merke";
import { harModul } from "@/lib/moduler";

/**
 * Navigasjon per agent, ikke per funksjon.
 *
 * Hver agent er én toppnivåknapp med funksjonene sine som faner under — og
 * fanene står alltid framme. Menyen er kort nok til at alt får plass, og en
 * meny der radene kommer og går etter hvor man står, er en meny man må lete
 * i. Blir det trangt den dagen tre agenter har fire faner hver, er det den
 * avgjørelsen som skal revurderes — ikke antall agenter.
 *
 * Under agentene ligger Selskap: det som gjelder kontoen og ikke en enkelt
 * agent — abonnement, medlemmer, firmaopplysninger. Innstillinger som hører
 * til én agent, som postkasse og tone, blir værende hos agenten.
 *
 * Hvilke moduler som vises styres av companies.moduler (lib/moduler.ts).
 * Tilbud står alltid; Ordre bare når selskapet har modulen. Det er samme
 * bryter som API-et sjekker, så menyen og tilgangen kan ikke sprike.
 */

interface NavTab {
  label: string;
  href: string;
}

interface NavSection {
  key: string;
  label: string;
  icon: string;
  basePath: string;
  tabs: NavTab[];
  comingSoon?: boolean;
}

const TILBUD: NavSection = {
  key: "tilbud",
  label: "Tilbud",
  icon: "◆",
  basePath: "/tilbud",
  tabs: [
    { label: "Leads", href: "/tilbud/leads" },
    { label: "Prisfil", href: "/tilbud/prisfil" },
    { label: "Referansefiler", href: "/tilbud/referansefiler" },
    { label: "Innstillinger", href: "/tilbud/innstillinger" },
  ],
};

const ORDRE: NavSection = {
  key: "ordre",
  label: "Ordre",
  icon: "▣",
  basePath: "/ordre",
  tabs: [
    { label: "Ordrer", href: "/ordre" },
    { label: "Leverandørfakturaer", href: "/ordre/leverandorfakturaer" },
    { label: "Grossister", href: "/ordre/grossister" },
    { label: "Innstillinger", href: "/ordre/innstillinger" },
  ],
};

const DOKUMENTASJON: NavSection = {
  key: "dokumentasjon",
  label: "Dokumentasjon",
  icon: "◇",
  basePath: "/dokumentasjon",
  tabs: [],
  comingSoon: true,
};

/** Seksjonene selskapet skal se, i rekkefølgen jobben går: tilbud → ordre → dokumentasjon. */
function agentSections(moduler: string[]): NavSection[] {
  const sections = [TILBUD];
  if (harModul(moduler, "ordre")) sections.push(ORDRE);
  sections.push(DOKUMENTASJON);
  return sections;
}

const COMPANY: NavSection = {
  key: "selskap",
  label: "Selskap",
  icon: "◉",
  basePath: "/selskap",
  tabs: [
    { label: "Abonnement", href: "/selskap/abonnement" },
    { label: "Medlemmer", href: "/selskap/medlemmer" },
    { label: "Detaljer", href: "/selskap/detaljer" },
  ],
};

export function Sidebar({
  companyName,
  userEmail,
  moduler,
}: {
  companyName: string;
  userEmail: string;
  /** companies.moduler — hvilke seksjoner som skal vises. */
  moduler: string[];
}) {
  const pathname = usePathname();

  // Mobil: menyen ligger bak en knapp og lukker seg når man har valgt.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  function renderSection(section: NavSection) {
    const active = pathname.startsWith(section.basePath);
    // «/ordre» er prefiks for alle ordre-sidene; den lengste fanen som
    // passer er den som gjelder, ellers ville Ordrer alltid stått aktiv.
    const aktivFane = section.tabs
      .filter((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0];
    return (
      <div className="nav-agent" key={section.key}>
        {section.comingSoon ? (
          <button className="nav-button disabled" type="button" disabled>
            <span className="nav-icon">{section.icon}</span>
            {section.label}
            <span className="nav-badge">snart</span>
          </button>
        ) : (
          <Link
            className={`nav-button${active ? " active" : ""}`}
            href={section.tabs[0]?.href ?? section.basePath}
          >
            <span className="nav-icon">{section.icon}</span>
            {section.label}
          </Link>
        )}

        {section.tabs.length > 0 && (
          <nav className="nav-tabs">
            {section.tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`nav-tab${tab === aktivFane ? " active" : ""}`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    );
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <Merke size={24} />
        Devello
      </div>

      <div className="sidebar-topbar">
        <span className="brand-mobil">
          <Merke size={22} />
          Devello
        </span>
        <button
          type="button"
          className="button secondary"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Lukk" : "Meny"}
        </button>
      </div>

      <div className={`sidebar-nav${open ? " open" : ""}`}>
        {agentSections(moduler).map(renderSection)}

        <div className="nav-separator" />
        {renderSection(COMPANY)}

        <div className="sidebar-footer">
          <div>{companyName}</div>
          <div>{userEmail}</div>
          <SignOut />
        </div>
      </div>
    </aside>
  );
}
