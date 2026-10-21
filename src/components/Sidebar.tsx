"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SignOut } from "@/components/SignOut";
import { Merke } from "@/components/Merke";
import { SelskapVelger } from "@/components/SelskapVelger";
import { harModul } from "@/lib/moduler";

/**
 * Navigasjon etter hvor ofte man er der.
 *
 * Over skillelinjen står det daglige: Tilbud, Ordre og Register — bare
 * hovedoverskriftene. Undersidene (som kontakter, leverandørfakturaer og
 * grossister under Register) er faner inne på siden, ikke i menyen, så
 * menyen holder seg kort.
 *
 * Under skillelinjen ligger Selskap: det som settes opp én gang eller
 * justeres sjelden — abonnement, medlemmer og innstillinger. Innstillinger
 * er én inngang; bak den ligger firmaopplysninger og oppsettet for hver
 * agent, prisfil og referansefiler, med egen fanestripe (se
 * app/selskap/innstillinger).
 *
 * Hvilke moduler som vises styres av companies.moduler (lib/moduler.ts):
 * Ordre, leverandørfakturaer og grossister bare når selskapet har
 * ordremodulen. Det er samme bryter som sidene og API-et sjekker, så menyen
 * og tilgangen kan ikke sprike.
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
  /** Der knappen går. Uten: første fane, eller basePath. */
  href?: string;
  tabs: NavTab[];
  comingSoon?: boolean;
}

/** Startsiden, som i Go: tall og forbruk på ett sted. */
const DASHBOARD: NavSection = {
  key: "dashboard",
  label: "Dashboard",
  icon: "▦",
  basePath: "/dashboard",
  href: "/dashboard",
  tabs: [],
};

const TILBUD: NavSection = {
  key: "tilbud",
  label: "Tilbud",
  icon: "◆",
  basePath: "/tilbud",
  href: "/tilbud/leads",
  tabs: [],
};

const ORDRE: NavSection = {
  key: "ordre",
  label: "Ordre",
  icon: "▣",
  basePath: "/ordre",
  href: "/ordre",
  tabs: [],
};

/** Registrene. Fanene (kontakter, leverandørfakturaer, grossister) står på siden — se app/register. */
const REGISTER: NavSection = {
  key: "register",
  label: "Register",
  icon: "▤",
  basePath: "/register",
  href: "/register/kontakter",
  tabs: [],
};

/** Det daglige, i rekkefølgen jobben går: startsiden, tilbud → ordre, og registrene. */
function agentSections(moduler: string[]): NavSection[] {
  const sections = [DASHBOARD, TILBUD];
  if (harModul(moduler, "ordre")) sections.push(ORDRE);
  sections.push(REGISTER);
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

/** Devellos egne sider, bare for DEVELLO_ADMIN_EPOST (lib/devello-admin.ts). */
const DEVELLO: NavSection = {
  key: "devello",
  label: "Devello",
  icon: "✦",
  basePath: "/devello",
  tabs: [{ label: "Abonnementsfakturaer", href: "/devello/fakturaer" }],
};

function passer(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  companyName,
  userEmail,
  moduler,
  aktiv = true,
  erDevello = false,
  selskaper = [],
  aktivSelskapId = "",
}: {
  companyName: string;
  userEmail: string;
  /** companies.moduler — hvilke seksjoner som skal vises. */
  moduler: string[];
  /** Uten aktivt abonnement er bare Selskap åpent (lib/billing/tilgang.ts). */
  aktiv?: boolean;
  /** Devello-ansatt: viser Devello-seksjonen nederst. */
  erDevello?: boolean;
  /** Selskapene brukeren er med i. Flere enn ett: velgeren øverst i menyen. */
  selskaper?: { id: string; name: string }[];
  aktivSelskapId?: string;
}) {
  const pathname = usePathname();

  // Mobil: menyen ligger bak en knapp og lukker seg når man har valgt.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const agenter = aktiv ? agentSections(moduler) : [];

  // Den lengste fanen som passer er den som gjelder: /selskap/innstillinger
  // dekker alt under seg (prisfil, referansefiler …), /ordre bare ordrelisten.
  const aktivFane = [...agenter, SELSKAP, DEVELLO]
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
            href={section.href ?? section.tabs[0]?.href ?? section.basePath}
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
        {selskaper.length > 1 && <SelskapVelger selskaper={selskaper} aktivId={aktivSelskapId} />}
        {agenter.map(renderSection)}

        {agenter.length > 0 && <div className="nav-separator" />}
        {renderSection(SELSKAP)}
        {erDevello && renderSection(DEVELLO)}

        <div className="sidebar-footer">
          <div>{companyName}</div>
          <div>{userEmail}</div>
          <SignOut />
        </div>
      </div>
    </aside>
  );
}
