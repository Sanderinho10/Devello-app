"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOut } from "@/components/SignOut";
import { Merke } from "@/components/Merke";

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

const AGENTS: NavSection[] = [
  {
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
  },
  {
    key: "dokumentasjon",
    label: "Dokumentasjon",
    icon: "◇",
    basePath: "/dokumentasjon",
    tabs: [],
    comingSoon: true,
  },
];

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
}: {
  companyName: string;
  userEmail: string;
}) {
  const pathname = usePathname();

  function renderSection(section: NavSection) {
    const active = pathname.startsWith(section.basePath);
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
                className={`nav-tab${pathname.startsWith(tab.href) ? " active" : ""}`}
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

      {AGENTS.map(renderSection)}

      <div className="nav-separator" />
      {renderSection(COMPANY)}

      <div className="sidebar-footer">
        <div>{companyName}</div>
        <div>{userEmail}</div>
        <SignOut />
      </div>
    </aside>
  );
}
