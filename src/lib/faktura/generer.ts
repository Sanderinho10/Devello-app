import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { byggKontekst } from "./kontekst";
import { hentKjelder } from "./kjelder";
import { planTilLinjer } from "./resolver";
import type { FakturaPlan } from "./typar";
import { loggFakturaVersjon } from "./versjon";
import { MODEL, structured } from "@/lib/claude/client";
import { lesTekst } from "@/lib/claude/motor";
import type { Company, InvoiceDraft, Order } from "@/lib/types";

/**
 * Fakturaforslaget: modellen lager en plan, koden regner linjene.
 *
 * Ett kall til Opus med instruksene i agent/faktura/ som systemprompt
 * (mellomlagret — de er like for alle kunder) og ordren som prompt. Svaret
 * er en FakturaPlan uten tall. Resolveren gjør den til linjer med beløp fra
 * kildene; peker planen feil, får modellen problemene tilbake én gang, som
 * validate() i tilbudsgenereringen. Feiler det igjen, feiler kallet med
 * beskjed — heller ingen faktura enn en gal.
 */

const PLAN_LINE_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["tilbod_seksjon", "tilbod_linje", "timer", "materiell", "tekst"],
      description:
        "tilbod_seksjon = én tilbudsseksjon (id «s1»); tilbod_linje = tilbudslinjer (id «s1-l2»); timer = timeføringer (uuid); materiell = materiell-linjer (uuid); tekst = tekstlinje uten pris og uten kilder.",
    },
    source_ids: {
      type: "array",
      items: { type: "string" },
      description: "Id-ene fra konteksten linjen bygger på. Tom liste bare for tekst.",
    },
    description: { type: "string", description: "Teksten kunden ser på fakturalinjen. Kort, i målformen. Ingen priser." },
    included: { type: "boolean", description: "true = med på fakturaen. false = vises, men anbefales holdt utenfor." },
    reason: {
      type: ["string", "null"],
      description: "Kort begrunnelse — obligatorisk for tillegg og for included=false. null ellers.",
    },
  },
  required: ["kind", "source_ids", "description", "included", "reason"],
  additionalProperties: false,
} as const;

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    strategy: {
      type: "string",
      enum: ["fastpris", "fastpris_med_tillegg", "tid_og_materiell"],
      description: "Se instruksen. tid_og_materiell når ordren ikke har et fastpris-/punktpristilbud.",
    },
    lines: {
      type: "array",
      items: PLAN_LINE_SCHEMA,
      description: "Det som faktureres iht. tilbudet — eller alt, ved tid og materiell.",
    },
    extras: {
      type: "array",
      items: PLAN_LINE_SCHEMA,
      description: "Tillegg utover tilbudet, hver med reason. Tom ved tid og materiell.",
    },
    notes: { type: "array", items: { type: "string" }, description: "Maks 5. Det brukeren bør vite. Målformen." },
    questions: {
      type: "array",
      items: { type: "string" },
      description: "Maks 5. Det brukeren bør avklare før overføring, formulert så det kan svares ja/nei. Målformen.",
    },
    invoice_text: {
      type: "string",
      description: "1–3 setninger øverst på fakturaen: hva som er gjort og hvor. Ingen priser. Målformen.",
    },
  },
  required: ["strategy", "lines", "extras", "notes", "questions", "invoice_text"],
  additionalProperties: false,
} as const;

let systemCache: string | null = null;

async function loadFakturaAgent(): Promise<string> {
  if (systemCache) return systemCache;
  const dir = path.join(process.cwd(), "agent", "faktura");
  const deler = await Promise.all(
    ["CLAUDE.md", "lag-fakturaforslag.md"].map((f) => lesTekst(path.join(dir, f))),
  );
  systemCache = deler.join("\n\n---\n\n");
  return systemCache;
}

export class FakturaFeil extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "FakturaFeil";
  }
}

export async function lagFakturaforslag(
  admin: SupabaseClient,
  input: { ordre: Order; company: Pick<Company, "name" | "tone_settings">; userId: string },
): Promise<InvoiceDraft> {
  const { ordre } = input;
  if (ordre.status === "opna") throw new FakturaFeil("Sett ordren i gang først.", 400);
  if (ordre.status === "fakturert") throw new FakturaFeil("Ordren er allerede fakturert.", 400);
  if (ordre.status === "avbrutt") throw new FakturaFeil("Ordren er avbrutt.", 400);

  const { data: eksisterande } = await admin
    .from("invoice_drafts")
    .select("*")
    .eq("order_id", ordre.id)
    .eq("company_id", ordre.company_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const gammalt = (eksisterande as InvoiceDraft | null) ?? null;
  if (gammalt?.status === "overfort") {
    throw new FakturaFeil("Fakturaforslaget er allerede overført til regnskapssystemet.", 400);
  }

  const { kjelder } = await hentKjelder(admin, ordre);
  const harNoko =
    kjelder.sections.length > 0 ||
    kjelder.timar.some((t) => t.billable && !t.invoiced) ||
    kjelder.materiell.some((m) => m.billable && !m.invoiced && !m.replaced);
  if (!harNoko) {
    throw new FakturaFeil("Det er ingenting å fakturere: verken tilbud, timer eller materiell på ordren.", 400);
  }

  const maalform = input.company.tone_settings?.maalform === "nn" ? "nn" : "nb";
  const system = await loadFakturaAgent();
  const kontekst = byggKontekst(ordre, kjelder, maalform);
  const usage = { companyId: ordre.company_id, kind: "fakturaforslag" as const, leadId: ordre.lead_id };

  const kall = (prompt: string) =>
    structured<FakturaPlan>({
      system,
      cacheSystem: true,
      prompt,
      schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      effort: "high",
      usage,
    });

  let plan = normaliser(await kall(kontekst));
  let resultat = planTilLinjer(plan, kjelder);
  if (resultat.problems.length > 0) {
    const retry =
      `${kontekst}\n\n---\n\nFORRIGE FORSØK FEILET VALIDERINGEN. Rett dette og lever hele planen på nytt:\n` +
      resultat.problems.map((p) => `- ${p}`).join("\n");
    plan = normaliser(await kall(retry));
    resultat = planTilLinjer(plan, kjelder);
    if (resultat.problems.length > 0) {
      throw new FakturaFeil(
        `Forslaget besto ikke valideringen: ${resultat.problems.slice(0, 3).join("; ")}`,
        502,
      );
    }
  }

  const naa = new Date().toISOString();
  const rad = {
    company_id: ordre.company_id,
    order_id: ordre.id,
    status: "utkast",
    strategy: plan.strategy,
    lines: resultat.lines,
    totals: resultat.totals,
    invoice_text: plan.invoice_text.trim() || null,
    customer_reference: gammalt?.customer_reference ?? ordre.customer_contact ?? null,
    notes: plan.notes,
    questions: plan.questions,
    ai_model: MODEL,
    generated_at: naa,
    approved_by: null,
    approved_at: null,
    transfer_error: null,
    created_by: input.userId,
  };

  let lagra: InvoiceDraft;
  if (gammalt) {
    const { data, error } = await admin
      .from("invoice_drafts")
      .update(rad)
      .eq("id", gammalt.id)
      .select("*")
      .single();
    if (error) throw new Error(`Kunne ikke lagre fakturaforslaget: ${error.message}`);
    lagra = data as InvoiceDraft;
  } else {
    const { data, error } = await admin.from("invoice_drafts").insert(rad).select("*").single();
    if (error) throw new Error(`Kunne ikke lagre fakturaforslaget: ${error.message}`);
    lagra = data as InvoiceDraft;
  }

  await loggFakturaVersjon(admin, {
    draftId: lagra.id,
    source: "ai",
    snapshot: { lines: lagra.lines, totals: lagra.totals, invoice_text: lagra.invoice_text },
    previous: gammalt ? { lines: gammalt.lines, totals: gammalt.totals, invoice_text: gammalt.invoice_text } : null,
    userId: input.userId,
  });

  return lagra;
}

/** Trimmer og klipper det modellen sendte, før resolveren ser det. */
function normaliser(raw: FakturaPlan): FakturaPlan {
  const linje = (l: FakturaPlan["lines"][number]) => ({
    kind: l.kind,
    source_ids: Array.isArray(l.source_ids) ? l.source_ids.map(String) : [],
    description: String(l.description ?? "").trim(),
    included: l.included !== false,
    reason: typeof l.reason === "string" && l.reason.trim() ? l.reason.trim() : null,
  });
  return {
    strategy: raw.strategy,
    lines: (raw.lines ?? []).map(linje),
    extras: (raw.extras ?? []).map(linje),
    notes: (raw.notes ?? []).map((n) => String(n).trim()).filter(Boolean).slice(0, 5),
    questions: (raw.questions ?? []).map((q) => String(q).trim()).filter(Boolean).slice(0, 5),
    invoice_text: String(raw.invoice_text ?? ""),
  };
}
