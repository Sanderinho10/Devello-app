"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigasjon per agent, ikke per funksjon.
 *
 * Hver agent er én toppnivåknapp, og agentens funksjoner ligger som faner inni
 * den. Når SoMe- og Annonser-agentene kommer, blir de egne oppføringer i AGENTS
 * med sine egne faner — ingen endring i mønsteret, ingen nye menyrader på
 * toppnivå.
 */

interface AgentTab {
  label: string;
  href: string;
}

interface Agent {
  key: string;
  label: string;
  icon: string;
  basePath: string;
  tabs: AgentTab[];
  comingSoon?: boolean;
}

const AGENTS: Agent[] = [
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
  { key: "some", label: "SoMe", icon: "◇", basePath: "/some", tabs: [], comingSoon: true },
  {
    key: "annonser",
    label: "Annonser",
    icon: "◇",
    basePath: "/annonser",
    tabs: [],
    comingSoon: true,
  },
];

export function Sidebar({
  companyName,
  userEmail,
}: {
  companyName: string;
  userEmail: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">D</span>
        Devello
      </div>

      {AGENTS.map((agent) => {
        const active = pathname.startsWith(agent.basePath);
        return (
          <div className="nav-agent" key={agent.key}>
            {agent.comingSoon ? (
              <button className="nav-button disabled" type="button" disabled>
                <span className="nav-icon">{agent.icon}</span>
                {agent.label}
                <span className="nav-badge">snart</span>
              </button>
            ) : (
              <Link
                className={`nav-button${active ? " active" : ""}`}
                href={agent.tabs[0]?.href ?? agent.basePath}
              >
                <span className="nav-icon">{agent.icon}</span>
                {agent.label}
              </Link>
            )}

            {active && agent.tabs.length > 0 && (
              <nav className="nav-tabs">
                {agent.tabs.map((tab) => (
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
      })}

      <div className="sidebar-footer">
        {companyName}
        <br />
        {userEmail}
      </div>
    </aside>
  );
}
