"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SignOut } from "@/components/SignOut";
import { Merke } from "@/components/Merke";
import { harModul } from "@/lib/moduler";

/**
 * Navigasjon etter hvor ofte man er der.
 *
 * Øverst står det daglige: Tilbud (leads), Ordre (ordrer og
 * leverandørfakturaer) og Kunder. Det er arbeidslisten, og den skal være
 * kort nok til at alt får plass uten å lete.
 *
 * Under skillelinjen ligger Selskap: det som settes opp én gang eller
 * justeres sjelden — abonnement, medlemmer og innstillinger. Innstillinger
 * er én inngang; bak den ligger firmaopplysninger og oppsettet for hver
 * agent, prisfil, referansefiler og grossister, med egen fanestripe (se
 * app/selskap/innstillinger). Menyen holdes kort: en prisfil man rører to
 * ganger i året skal ikke ta plass ved siden av det daglige.
 *
 * Hvilke moduler som vises styres av companies.moduler (lib/moduler.ts):
 * Ordre bare når selskapet har modulen. Det er samme bryter som API-et
 * sjekker, så menyen og tilgangen kan ikke sprike.
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
  tabs: [{ label: "Leads", href: "/tilbud/leads" }],
};

const ORDRE: NavSection = {
  key: "ordre",
  label: "Ordre",
  icon: "▣",
  basePath: "/ordre",
  tabs: [
    { label: "Ordrer", href: "/ordre" },
    { label: "Leverandørfakturaer", href: "/ordre/leverandorfakturaer" },
  ],
};

/** Kunderegisteret går på tvers av agentene. Én knapp — kundesiden er listen. */
const KUNDER: NavSection = {
  key: "kunder",
  label: "Kunder",
  icon: "◎",
  basePath: "/kunder",
  tabs: [],
};

/** Det daglige, i rekkefølgen jobben går: tilbud → ordre → kunder. */
function agentSections(moduler: string[]): NavSection[] {
  const sections = [TILBUD];
  if (harModul(moduler, "ordre")) sections.push(ORDRE);
  sections.push(KUNDER);
  return sections;
}

/** Oppsettet: kontoen, folkene, og én inngang til resten. */
const SELSKAP: NavSection = {
  key: "selskap",
  label: "Selskap",
  icon: "◉",
  basePath: "/selskap",
  tabs: [
    { label: "Abonnement", href: "/selskap/abonnement" },
    { label: "Medlemmer", href: "/selskap/medlemmer" },
    { label: "Innstillinger", href: "/selskap/innstillinger" },
  ],
};

function passer(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

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

  const agenter = agentSections(moduler);

  // Den lengste fanen som passer er den som gjelder: /selskap/innstillinger
  // dekker alt under seg (prisfil, grossister …), /ordre bare ordrelisten.
  const aktivFane = [...agenter, SELSKAP]
    .flatMap((s) => s.tabs)
    .filter((tab) => passer(pathname, tab.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  function renderSection(section: NavSection) {
    const active = aktivFane
      ? section.tabs.includes(aktivFane)
      : pathname.startsWith(section.basePath);
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
        {agenter.map(renderSection)}

        <div className="nav-separator" />
        {renderSection(SELSKAP)}

        <div className="sidebar-footer">
          <div>{companyName}</div>
          <div>{userEmail}</div>
          <SignOut />
        </div>
      </div>
    </aside>
  );
}
