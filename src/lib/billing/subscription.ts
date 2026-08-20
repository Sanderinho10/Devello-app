import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AGENTS,
  findAgentPlan,
  plansForAgent,
  type Agent,
  type AgentPlan,
} from "./agents";

/**
 * Abonnement, perioder og forbruk.
 *
 * Perioden regnes ut fra startdatoen, den lagres ikke. Et abonnement som
 * startet 16. august har perioder 16.8–16.9, 16.9–16.10 og så videre, og
 * hvilken som gjelder nå følger av datoen. Alternativet — å lagre start og
 * slutt på raden — krever noe som ruller dem videre hver måned, og den jobben
 * kan feile stille: da ville en kunde enten fått gratis tilbud eller blitt
 * fakturert for en periode som aldri tok slutt.
 */

export interface Abonnement {
  id: string;
  companyId: string;
  agentId: string;
  planId: string;
  /** Avtalt pris, frosset ved valget. Ikke slå opp i katalogen for dette. */
  priceNok: number;
  quota: number;
  overageNok: number;
  startedAt: string;
  cancelAtPeriodEnd: boolean;
}

export interface Periode {
  start: Date;
  slutt: Date;
  /** 0 for den første perioden, 1 for den neste, og så videre. */
  nummer: number;
}

export interface AgentStatus {
  agent: Agent;
  planer: AgentPlan[];
  abonnement: Abonnement | null;
  periode: Periode;
  /** Talte enheter i den gjeldende perioden. */
  brukt: number;
  /** Enheter over kvoten. 0 uten abonnement — da er det ingen kvote å sprenge. */
  overforbruk: number;
  overforbrukKr: number;
  /** Pakken de ville spart penger på å stå på i stedet. */
  bedrePakke: { plan: AgentPlan; sparerKr: number } | null;
}

// ---------------------------------------------------------------------------
// Perioder
// ---------------------------------------------------------------------------

/**
 * Legger til hele måneder med klemming på månedslengde.
 *
 * new Date(2026, 0, 31) + 1 måned er 3. mars i vanlig JS-datoregning, fordi
 * 31. februar ruller over. En kunde som startet den 31. skal ha periodeskifte
 * den 28., ikke miste tre dager annenhver måned.
 */
export function leggTilMaanader(dato: Date, antall: number): Date {
  const dag = dato.getUTCDate();
  const ny = new Date(
    Date.UTC(
      dato.getUTCFullYear(),
      dato.getUTCMonth() + antall,
      1,
      dato.getUTCHours(),
      dato.getUTCMinutes(),
      dato.getUTCSeconds(),
      dato.getUTCMilliseconds(),
    ),
  );
  const sisteDagIMaaneden = new Date(
    Date.UTC(ny.getUTCFullYear(), ny.getUTCMonth() + 1, 0),
  ).getUTCDate();
  ny.setUTCDate(Math.min(dag, sisteDagIMaaneden));
  return ny;
}

/** Perioden som løper nå, regnet fra ankeret. */
export function gjeldandePeriode(anker: string | Date, no: Date = new Date()): Periode {
  const start = anker instanceof Date ? anker : new Date(anker);

  let n =
    (no.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (no.getUTCMonth() - start.getUTCMonth());
  // Månedsdifferansen bommer med én når vi ennå ikke har passert dagen i
  // måneden. 3. mars mot anker 16. januar er to kalendermåneder, men bare én
  // hel periode.
  if (leggTilMaanader(start, n) > no) n -= 1;
  if (n < 0) n = 0;

  return {
    start: leggTilMaanader(start, n),
    slutt: leggTilMaanader(start, n + 1),
    nummer: n,
  };
}

// ---------------------------------------------------------------------------
// Lesing
// ---------------------------------------------------------------------------

/**
 * Status for hver agent i katalogen — også de selskapet ikke har kjøpt, for
 * det er den listen abonnementssiden viser.
 *
 * Uten abonnement teller vi fortsatt forbruket, med selskapets opprettelsesdato
 * som anker. I prøveperioden skal de kunne se hvor mye de faktisk bruker før
 * de velger pakke.
 */
export async function abonnementsoversikt(
  admin: SupabaseClient,
  companyId: string,
  companyCreatedAt: string,
): Promise<AgentStatus[]> {
  const [{ data: rader }, { data: hendingar }] = await Promise.all([
    admin.from("subscriptions").select("*").eq("company_id", companyId),
    admin
      .from("usage_events")
      .select("agent_id, quantity, created_at")
      .eq("company_id", companyId),
  ]);

  const abonnement = new Map<string, Abonnement>();
  for (const rad of rader ?? []) abonnement.set(rad.agent_id, tilAbonnement(rad));

  return AGENTS.map((agent) => {
    const sub = abonnement.get(agent.id) ?? null;
    const periode = gjeldandePeriode(sub?.startedAt ?? companyCreatedAt);

    let brukt = 0;
    for (const h of hendingar ?? []) {
      if (h.agent_id !== agent.id) continue;
      const tid = new Date(h.created_at);
      if (tid >= periode.start && tid < periode.slutt) brukt += h.quantity ?? 1;
    }

    const overforbruk = sub ? Math.max(0, brukt - sub.quota) : 0;
    const overforbrukKr = overforbruk * (sub?.overageNok ?? 0);

    return {
      agent,
      planer: plansForAgent(agent.id),
      abonnement: sub,
      periode,
      brukt,
      overforbruk,
      overforbrukKr,
      bedrePakke: sub ? finnBedrePakke(sub, brukt) : null,
    };
  });
}

/** Kroner for én periode med dette forbruket: fastprisen pluss overforbruket. */
export function periodekostnad(
  avtale: { priceNok: number; quota: number; overageNok: number },
  brukt: number,
): number {
  return avtale.priceNok + Math.max(0, brukt - avtale.quota) * avtale.overageNok;
}

/**
 * Ville en annen pakke kostet dem mindre med dette forbruket?
 *
 * Overforbrukssatsen er høyere enn enhetsprisen i alle pakkene, så den som
 * ligger jevnt over taket taper på å bli stående. Det skal stå i UI-et og ikke
 * bare i regnestykket vårt — en kunde som oppdager dette selv etter tre
 * fakturaer, oppdager samtidig at vi visste det.
 */
export function finnBedrePakke(
  sub: { agentId: string; planId: string; priceNok: number; quota: number; overageNok: number },
  brukt: number,
): { plan: AgentPlan; sparerKr: number } | null {
  const naa = periodekostnad(sub, brukt);

  let beste: { plan: AgentPlan; sparerKr: number } | null = null;
  for (const plan of plansForAgent(sub.agentId)) {
    if (plan.id === sub.planId) continue;
    const sparer = naa - periodekostnad(plan, brukt);
    if (sparer > 0 && (!beste || sparer > beste.sparerKr)) {
      beste = { plan, sparerKr: sparer };
    }
  }
  return beste;
}

function tilAbonnement(rad: Record<string, unknown>): Abonnement {
  return {
    id: rad.id as string,
    companyId: rad.company_id as string,
    agentId: rad.agent_id as string,
    planId: rad.plan_id as string,
    priceNok: Number(rad.price_nok),
    quota: Number(rad.included_quota),
    overageNok: Number(rad.overage_nok),
    startedAt: rad.started_at as string,
    cancelAtPeriodEnd: Boolean(rad.cancel_at_period_end),
  };
}

// ---------------------------------------------------------------------------
// Skriving
// ---------------------------------------------------------------------------

/**
 * Velger eller bytter pakke på én agent.
 *
 * started_at settes bare første gang. Bytter de pakke midt i en periode,
 * beholder de periodeskiftet sitt — ellers ville et bytte nullstilt forbruket
 * og gitt en gratis måned, og et bytte den andre veien ville tatt fra dem
 * dager de har betalt for.
 */
export async function velgPakke(
  admin: SupabaseClient,
  companyId: string,
  planId: string,
): Promise<{ agentId: string }> {
  const plan = findAgentPlan(planId);
  if (!plan) throw new Error("Ukjent pakke.");

  const { data: eksisterande } = await admin
    .from("subscriptions")
    .select("id, started_at")
    .eq("company_id", companyId)
    .eq("agent_id", plan.agentId)
    .maybeSingle();

  const felt = {
    company_id: companyId,
    agent_id: plan.agentId,
    plan_id: plan.id,
    price_nok: plan.priceNok,
    included_quota: plan.quota,
    overage_nok: plan.overageNok,
    cancel_at_period_end: false,
    updated_at: new Date().toISOString(),
  };

  const { error } = eksisterande
    ? await admin.from("subscriptions").update(felt).eq("id", eksisterande.id)
    : await admin.from("subscriptions").insert(felt);
  if (error) throw new Error(error.message);

  return { agentId: plan.agentId };
}

/** Sier opp med virkning fra periodeslutt. Pakken virker ut måneden. */
export async function seiOppPakke(
  admin: SupabaseClient,
  companyId: string,
  agentId: string,
  angre = false,
): Promise<void> {
  const { error } = await admin
    .from("subscriptions")
    .update({
      cancel_at_period_end: !angre,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("agent_id", agentId);
  if (error) throw new Error(error.message);
}

/**
 * Teller én enhet.
 *
 * Idempotent per referanse: den unike indeksen i 0025 gjør at det samme
 * leadet aldri kan telles to ganger, uansett hvor mange ganger agenten kjører
 * på det. Feiler skrivingen av en annen grunn, går tilbudet ut som normalt —
 * en teller som stopper produksjonen er verre enn en teller som bommer.
 */
export async function registrerBruk(
  admin: SupabaseClient,
  input: { companyId: string; agentId: string; referenceId?: string | null },
): Promise<void> {
  try {
    const { error } = await admin.from("usage_events").insert({
      company_id: input.companyId,
      agent_id: input.agentId,
      reference_id: input.referenceId ?? null,
    });
    // 23505 = unik indeks. Leadet er talt før; det er meningen.
    if (error && error.code !== "23505") throw new Error(error.message);
  } catch (err) {
    console.warn(
      "kunne ikke registrere forbruk:",
      err instanceof Error ? err.message : err,
    );
  }
}
