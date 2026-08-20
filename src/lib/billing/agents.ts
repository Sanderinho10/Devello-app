/**
 * Agent- og pakkekatalogen.
 *
 * Vi selger per agent. En kunde kan ha stor pakke på tilbud og liten på
 * dokumentasjon når den kommer — derfor står pakkene under agenten de hører
 * til, og ikke i én felles liste.
 *
 * Katalogen ligger i koden, ikke i databasen, fordi den er en produktavgjørelse
 * som skal gjennom en kodegjennomgang. Det selskapet faktisk har avtalt ligger
 * i databasen: pris, kvote og sats kopieres inn på abonnementsraden når pakken
 * velges, så en prisendring her aldri kan endre en løpende avtale.
 */

export interface Agent {
  id: string;
  name: string;
  tagline: string;
  /** Det vi teller. «tilbud» → «30 tilbud i måneden». */
  unit: { ein: string; fleire: string };
  /** false = vises som «kommer», uten pakker å velge. */
  available: boolean;
  /** Hva den vil gjøre, for agentene som ikke er lansert. */
  note?: string;
}

export interface AgentPlan {
  id: string;
  agentId: string;
  name: string;
  /** Kroner per måned, eks. mva. */
  priceNok: number;
  /** Antall enheter inkludert per måned. */
  quota: number;
  /** Kroner per enhet over kvoten, eks. mva. */
  overageNok: number;
  recommended?: boolean;
}

export const AGENTS: Agent[] = [
  {
    id: "tilbud",
    name: "Tilbudsagenten",
    tagline:
      "Leser innboksen, velger tilbudstype og lager utkast med PDF på deres egen mal.",
    unit: { ein: "tilbud", fleire: "tilbud" },
    available: true,
  },
  {
    id: "dokumentasjon",
    name: "Dokumentasjonsagenten",
    tagline: "Samsvarserklæringer og sluttdokumentasjon.",
    unit: { ein: "sak", fleire: "saker" },
    available: false,
    note: "Under arbeid. Si fra om dere vil være med og teste.",
  },
];

export const AGENT_PLANS: AgentPlan[] = [
  {
    id: "tilbud_liten",
    agentId: "tilbud",
    name: "Liten",
    priceNok: 950,
    quota: 30,
    overageNok: 39,
  },
  {
    id: "tilbud_medium",
    agentId: "tilbud",
    name: "Medium",
    priceNok: 1990,
    quota: 75,
    overageNok: 39,
    recommended: true,
  },
  {
    id: "tilbud_stor",
    agentId: "tilbud",
    name: "Stor",
    priceNok: 3490,
    quota: 150,
    overageNok: 39,
  },
];

export function findAgent(id: string | null | undefined): Agent | null {
  if (!id) return null;
  return AGENTS.find((a) => a.id === id) ?? null;
}

export function findAgentPlan(id: string | null | undefined): AgentPlan | null {
  if (!id) return null;
  return AGENT_PLANS.find((p) => p.id === id) ?? null;
}

export function plansForAgent(agentId: string): AgentPlan[] {
  return AGENT_PLANS.filter((p) => p.agentId === agentId);
}

/** «tilbud» / «tilbud», «sak» / «saker». */
export function unitLabel(agent: Agent, antall: number): string {
  return antall === 1 ? agent.unit.ein : agent.unit.fleire;
}

export function formatPrice(nok: number): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(nok);
}

/** Dager igjen av prøveperioden. Negativt tall betyr at den er ute. */
export function trialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
