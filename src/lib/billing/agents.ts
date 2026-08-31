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
  /** Det vi teller. «tilbud» → «20 tilbud i måneden». */
  unit: { ein: string; fleire: string };
}

export interface AgentPlan {
  id: string;
  agentId: string;
  name: string;
  /** Hvem pakken er for. Samme ordlyd som på devello.no/priser. */
  tagline: string;
  /** Kroner per måned, eks. mva. */
  priceNok: number;
  /** Antall enheter inkludert per måned. */
  quota: number;
  /** Kroner per enhet over kvoten, eks. mva. */
  overageNok: number;
}

/**
 * Bare agenter som faktisk er til salgs.
 *
 * Agenter som er under arbeid hører hjemme i sidemenyen, der de står som
 * «snart». Abonnementssiden svarer på hva dere betaler for — en rad man ikke
 * kan kjøpe hører ikke til i det svaret.
 */
export const AGENTS: Agent[] = [
  {
    id: "tilbud",
    name: "Tilbudsagenten",
    tagline:
      "Leser innboksen, velger tilbudstype og lager utkast med PDF på deres egen mal.",
    unit: { ein: "tilbud", fleire: "tilbud" },
  },
];

/**
 * Samme pakker og priser som devello.no/priser viser. De to stedene må si det
 * samme — nettsiden er løftet, dette er regningen.
 */
export const AGENT_PLANS: AgentPlan[] = [
  {
    id: "tilbud_basis",
    agentId: "tilbud",
    name: "Basis",
    tagline: "Enkeltmannsforetak og små firma",
    priceNok: 790,
    quota: 30,
    overageNok: 29,
  },
  {
    id: "tilbud_pro",
    agentId: "tilbud",
    name: "Pro",
    tagline: "Firma med flere montører eller mye leads",
    priceNok: 1490,
    quota: 100,
    overageNok: 29,
  },
];

/**
 * Adressen «kontakt oss for større pakke» går til.
 *
 * ⚠️ Må være en postkasse noen faktisk leser. Lenken står ved siden av den
 * største pakken, så den som trykker er en kunde med mer volum enn katalogen
 * dekker — det er ikke henvendelsen å la ligge.
 */
export const KONTAKT_EPOST = "post@devello.no";

/** Største kvote i katalogen for en agent. Brukes i «over N i måneden»-teksten. */
export function stoersteKvote(agentId: string): number {
  return plansForAgent(agentId).reduce((max, p) => Math.max(max, p.quota), 0);
}

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
