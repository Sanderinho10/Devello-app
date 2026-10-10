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
 * justeres sjelden — abonnement, medlemmer, firmaopplysninger, og så
 * oppsettet for hver agent gruppert under agentens navn: prisfil,
 * referansefiler og postkasse for Tilbud; grossister og regnskap for
 * Ordre. Gruppene holder tilbud og ordre fra hverandre, uten at en
 * prisfil man rører to ganger i året tar plass i det daglige.
 *
 * URL-ene er som før (/tilbud/prisfil, /ordre/innstillinger …); det er
 * bare menyen som er organisert annerledes. Hvilke moduler som vises
 * styres av companies.moduler (lib/moduler.ts): Ordre, og oppsettet for
 * Ordre, bare når selskapet har modulen. Det er samme bryter som API-et
 * sjekker, så menyen og tilgangen kan ikke sprike.
 */

interface NavTab {
  label: string;
  href: string;
  /** Overskrift over fanen, når seksjonen er delt i grupper. */
  group?: string;
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

/** Oppsettet: kontoen først, så hver agents oppsett under agentens navn. */
function companySection(moduler: string[]): NavSection {
  const tabs: NavTab[] = [
    { label: "Abonnement", href: "/selskap/abonnement" },
    { label: "Medlemmer", href: "/selskap/medlemmer" },
    { label: "Detaljer", href: "/selskap/detaljer" },
    { label: "Prisfil", href: "/tilbud/prisfil", group: "Tilbud" },
    { label: "Referansefiler", href: "/tilbud/referansefiler", group: "Tilbud" },
    { label: "Innstillinger", href: "/tilbud/innstillinger", group: "Tilbud" },
  ];
  if (harModul(moduler, "ordre")) {
    tabs.push(
      { label: "Grossister", href: "/ordre/grossister", group: "Ordre" },
      { label: "Innstillinger", href: "/ordre/innstillinger", group: "Ordre" },
    );
  }
  return { key: "selskap", label: "Selskap", icon: "◉", basePath: "/selskap", tabs };
}

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
  const selskap = companySection(moduler);

  // Den lengste fanen som passer, uansett seksjon, er den som gjelder.
  // Prisfilen bor under /tilbud, men står i menyen under Selskap — så det er
  // fanen som avgjør hvilken seksjon som lyser, ikke starten på URL-en.
  const aktivFane = [...agenter, selskap]
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
            {section.tabs.map((tab, i) => (
              <span key={tab.href} className="nav-tab-wrap">
                {tab.group && tab.group !== section.tabs[i - 1]?.group && (
                  <span className="nav-group">{tab.group}</span>
                )}
                <Link
                  href={tab.href}
                  className={`nav-tab${tab === aktivFane ? " active" : ""}`}
                >
                  {tab.label}
                </Link>
              </span>
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
        {renderSection(selskap)}

        <div className="sidebar-footer">
          <div>{companyName}</div>
          <div>{userEmail}</div>
          <SignOut />
        </div>
      </div>
    </aside>
  );
}
