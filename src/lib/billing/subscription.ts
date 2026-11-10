import type { SupabaseClient } from "@supabase/supabase-js";
import { PAKKAR, finnPakke, type EiningSlag, type Intervall, type ModulId, type Pakke, type PakkeId } from "./katalog";
import { oppdaterModular } from "@/lib/moduler";

/**
 * Abonnement, perioder og forbruk.
 *
 * Éi pakke per selskap. Avtalen (grunnpris, inkluderte einingar,
 * einingsprisar) er frosen på rada. Forbruket er ei hendingslogg med tre
 * slag: tilbud (éin per lead), faktura (éin per ordre overført) og
 * app_bruker (éin per montør per kalendermånad, berre frå appen).
 *
 * Perioden blir rekna ut frå startdatoen, ho blir ikkje lagra. Eit
 * abonnement som starta 16. august har periodar 16.8–16.9, 16.9–16.10 og
 * så vidare (Mikro: 16.8–16.8 året etter), og kva som gjeld no følgjer av
 * datoen. Alternativet — å lagre start og slutt på rada — krev noko som
 * rullar dei vidare, og den jobben kan feile stille.
 */

/** Prisvilkåra — same form i katalogen (Pakke) og på rada (Abonnement). */
export interface Prising {
  interval: Intervall;
  priceNok: number;
  includedUnits: number;
  unitPriceNok: Record<EiningSlag, number>;
  includedAppUsers: number;
  appUserPriceNok: number;
}

export interface Abonnement extends Prising {
  id: string;
  companyId: string;
  packageId: PakkeId | string;
  startedAt: string;
  cancelAtPeriodEnd: boolean;
}

export interface Periode {
  start: Date;
  slutt: Date;
  /** 0 for den fyrste perioden, 1 for den neste, og så vidare. */
  nummer: number;
}

export interface Forbruk {
  tilbud: number;
  faktura: number;
  /** Aktive montørar i appen i perioden (månadspakke) eller i inneverande månad (Mikro). */
  appBrukarar: number;
  /**
   * Berre årspakken: montør-månadar over dei inkluderte, summert per
   * kalendermånad i perioden. Set → prisast direkte; elles reknast
   * max(0, appBrukarar − includedAppUsers).
   */
  appBrukarMaanadar?: number;
}

export interface Kostnad {
  grunnpris: number;
  einingar: number;
  appBrukarar: number;
  sum: number;
}

export interface Oversikt {
  pakke: Pakke | null;
  abonnement: Abonnement | null;
  periode: Periode;
  forbruk: Forbruk;
  /** Null utan abonnement — då er det ingen avtale å rekne på. */
  kostnad: Kostnad | null;
  bedrePakke: { pakke: Pakke; sparerKrPerMaanad: number } | null;
}

// ---------------------------------------------------------------------------
// Periodar
// ---------------------------------------------------------------------------

/**
 * Legg til heile månader med klemming på månadslengd.
 *
 * new Date(2026, 0, 31) + 1 månad er 3. mars i vanleg JS-datorekning, fordi
 * 31. februar rullar over. Ein kunde som starta den 31. skal ha periodeskifte
 * den 28., ikkje miste tre dagar annakvar månad.
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
  const sisteDagIMaanaden = new Date(Date.UTC(ny.getUTCFullYear(), ny.getUTCMonth() + 1, 0)).getUTCDate();
  ny.setUTCDate(Math.min(dag, sisteDagIMaanaden));
  return ny;
}

/** Perioden som går no, rekna frå ankeret. Månad eller år (12 månader, same klemming). */
export function gjeldandePeriode(anker: string | Date, no: Date = new Date(), interval: Intervall = "maanad"): Periode {
  const start = anker instanceof Date ? anker : new Date(anker);
  const steg = interval === "aar" ? 12 : 1;

  let maanader = (no.getUTCFullYear() - start.getUTCFullYear()) * 12 + (no.getUTCMonth() - start.getUTCMonth());
  let n = Math.floor(maanader / steg);
  // Månadsdifferansen bommar med éin når vi enno ikkje har passert dagen i
  // månaden. 3. mars mot anker 16. januar er to kalendermånader, men berre
  // éin heil periode.
  if (leggTilMaanader(start, n * steg) > no) n -= 1;
  if (n < 0) n = 0;
  maanader = n * steg;

  return {
    start: leggTilMaanader(start, maanader),
    slutt: leggTilMaanader(start, maanader + steg),
    nummer: n,
  };
}

/** Fyrste dag i kalendermånaden (UTC) som YYYY-MM-DD. Nøkkelen for app_bruker. */
export function maanadStart(no: Date = new Date()): string {
  return `${no.getUTCFullYear()}-${String(no.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// ---------------------------------------------------------------------------
// Rekning — reine funksjonar
// ---------------------------------------------------------------------------

/**
 * Kroner for éi periode med dette forbruket.
 *
 * Pakkar utan inkluderte einingar: tilbud × pris + faktura × pris.
 * Mikro: max(0, tilbud + faktura − 100) × 29. Montørar: over dei inkluderte,
 * 59 kr per månad — for Mikro summert per månad (appBrukarMaanadar).
 */
export function kostnadsdeling(p: Prising, f: Forbruk): Kostnad {
  let einingar: number;
  if (p.includedUnits > 0) {
    const over = Math.max(0, f.tilbud + f.faktura - p.includedUnits);
    // Same pris på begge slaga i Mikro; skulle dei skilje seg, prisast
    // overskotet til den dyraste — vi gjettar ikkje kva som kom fyrst.
    einingar = over * Math.max(p.unitPriceNok.tilbud, p.unitPriceNok.faktura);
  } else {
    einingar = f.tilbud * p.unitPriceNok.tilbud + f.faktura * p.unitPriceNok.faktura;
  }
  const montoerMaanadar = f.appBrukarMaanadar ?? Math.max(0, f.appBrukarar - p.includedAppUsers);
  const appBrukarar = montoerMaanadar * p.appUserPriceNok;
  return { grunnpris: p.priceNok, einingar, appBrukarar, sum: p.priceNok + einingar + appBrukarar };
}

export function periodekostnad(p: Prising, f: Forbruk): number {
  return kostnadsdeling(p, f).sum;
}

/**
 * Ville ei anna pakke kosta mindre med dette forbruket per månad?
 *
 * Berre pakkar med same eller fleire modular tel — ei pakke som tek frå dei
 * noko dei brukar, er ikkje «betre». Berre månadspakkar blir føreslegne:
 * Mikro er førehandsbetalt for eit år, og å skalere éin månad til tolv er
 * ei gjetting vi ikkje vil selje på. Forslaget kjem når det sparar minst
 * 50 kr i månaden. Poenget i praksis: dei gamle Basis/Pro-avtalane
 * (790/1 490 med kvote) er dyrare enn «Tilbud» for dei fleste, og det skal
 * stå i UI-et — ikkje berre i reknestykket vårt.
 */
export function finnBedrePakke(
  naaverande: Prising & { packageId?: string | null; moduler: ModulId[] },
  forbruk: Forbruk,
): { pakke: Pakke; sparerKrPerMaanad: number } | null {
  const naa = perMaanad(naaverande, forbruk);
  let beste: { pakke: Pakke; sparerKrPerMaanad: number } | null = null;
  for (const pakke of PAKKAR) {
    // Same pakke med same vilkår er ikkje eit forslag. Ei konvertert
    // Basis/Pro-rad heiter òg «tilbud», men har andre vilkår — for henne er
    // katalogens «Tilbud» nettopp forslaget.
    if (pakke.id === naaverande.packageId && sameVilkaar(pakke, naaverande)) continue;
    if (pakke.interval !== "maanad") continue;
    if (!naaverande.moduler.every((m) => pakke.moduler.includes(m))) continue;
    const sparer = naa - perMaanad(pakke, forbruk);
    if (sparer >= 50 && (!beste || sparer > beste.sparerKrPerMaanad)) beste = { pakke, sparerKrPerMaanad: sparer };
  }
  return beste;
}

function sameVilkaar(a: Prising, b: Prising): boolean {
  return (
    a.interval === b.interval &&
    a.priceNok === b.priceNok &&
    a.includedUnits === b.includedUnits &&
    a.unitPriceNok.tilbud === b.unitPriceNok.tilbud &&
    a.unitPriceNok.faktura === b.unitPriceNok.faktura &&
    a.includedAppUsers === b.includedAppUsers &&
    a.appUserPriceNok === b.appUserPriceNok
  );
}

/** Periodekostnad normalisert til månad: årspakke / 12. */
function perMaanad(p: Prising, f: Forbruk): number {
  return p.interval === "aar" ? periodekostnad(p, f) / 12 : periodekostnad(p, f);
}

/**
 * Konvertering av ei gammal rad (Basis/Pro: grunnpris + kvote + overpris)
 * til pakkeforma — same rekning som migrasjonen 0047 gjer i SQL. Her så
 * testen kan vise at avtalen ikkje endrar seg.
 */
export function konverterGammalAvtale(rad: { price_nok: number; included_quota: number; overage_nok: number }): Prising & { packageId: PakkeId } {
  return {
    packageId: "tilbud",
    interval: "maanad",
    priceNok: rad.price_nok,
    includedUnits: rad.included_quota,
    unitPriceNok: { tilbud: rad.overage_nok, faktura: 0 },
    includedAppUsers: 0,
    appUserPriceNok: 0,
  };
}

// ---------------------------------------------------------------------------
// Lesing
// ---------------------------------------------------------------------------

/**
 * Pakken selskapet står på, perioden, forbruket og rekninga.
 *
 * Utan abonnement tel vi framleis forbruket, med selskapets opprettingsdato
 * som anker og månadsperiode. I prøveperioden skal dei kunne sjå kor mykje
 * dei faktisk brukar før dei vel pakke.
 */
export async function abonnementsoversikt(admin: SupabaseClient, companyId: string, companyCreatedAt: string): Promise<Oversikt> {
  const [{ data: rad }, { data: hendingar }] = await Promise.all([
    admin.from("subscriptions").select("*").eq("company_id", companyId).maybeSingle(),
    admin.from("usage_events").select("kind, quantity, created_at, user_id, period_start").eq("company_id", companyId),
  ]);

  const abonnement = rad ? tilAbonnement(rad as Record<string, unknown>) : null;
  const pakke = abonnement ? finnPakke(abonnement.packageId) : null;
  const interval = abonnement?.interval ?? "maanad";
  const no = new Date();
  const periode = gjeldandePeriode(abonnement?.startedAt ?? companyCreatedAt, no, interval);

  const forbruk: Forbruk = { tilbud: 0, faktura: 0, appBrukarar: 0 };
  const brukararPerMaanad = new Map<string, Set<string>>();
  for (const h of hendingar ?? []) {
    const tid = new Date(h.created_at as string);
    if (tid < periode.start || tid >= periode.slutt) continue;
    if (h.kind === "tilbud") forbruk.tilbud += Number(h.quantity ?? 1);
    else if (h.kind === "faktura") forbruk.faktura += Number(h.quantity ?? 1);
    else if (h.kind === "app_bruker" && h.user_id) {
      const m = (h.period_start as string | null) ?? maanadStart(tid);
      const s = brukararPerMaanad.get(m) ?? new Set<string>();
      s.add(h.user_id as string);
      brukararPerMaanad.set(m, s);
    }
  }

  if (interval === "aar") {
    // Mikro: aktive montørar i inneverande månad til visning, og
    // montør-månadar over den inkluderte for heile året til rekninga.
    forbruk.appBrukarar = brukararPerMaanad.get(maanadStart(no))?.size ?? 0;
    const inkl = abonnement?.includedAppUsers ?? 0;
    forbruk.appBrukarMaanadar = [...brukararPerMaanad.values()].reduce((sum, s) => sum + Math.max(0, s.size - inkl), 0);
  } else {
    const alle = new Set<string>();
    for (const s of brukararPerMaanad.values()) for (const u of s) alle.add(u);
    forbruk.appBrukarar = alle.size;
  }

  const kostnad = abonnement ? kostnadsdeling(abonnement, forbruk) : null;
  const bedrePakke = abonnement && pakke ? finnBedrePakke({ ...abonnement, moduler: pakke.moduler }, forbruk) : null;

  return { pakke, abonnement, periode, forbruk, kostnad, bedrePakke };
}

function tilAbonnement(rad: Record<string, unknown>): Abonnement {
  const prisar = (rad.unit_prices as Partial<Record<EiningSlag, number>> | null) ?? {};
  return {
    id: rad.id as string,
    companyId: rad.company_id as string,
    packageId: rad.package_id as string,
    interval: rad.billing_interval === "aar" ? "aar" : "maanad",
    priceNok: Number(rad.price_nok),
    includedUnits: Number(rad.included_units ?? 0),
    unitPriceNok: { tilbud: Number(prisar.tilbud ?? 0), faktura: Number(prisar.faktura ?? 0) },
    includedAppUsers: Number(rad.included_app_users ?? 0),
    appUserPriceNok: Number(rad.app_user_price_nok ?? 0),
    startedAt: rad.started_at as string,
    cancelAtPeriodEnd: Boolean(rad.cancel_at_period_end),
  };
}

// ---------------------------------------------------------------------------
// Skriving
// ---------------------------------------------------------------------------

/**
 * Vel eller byter pakke. Byte = ny rad med nye frosne vilkår og nytt anker
 * (started_at = no): ein ny periode startar i dag. Det står i UI-et.
 * Modulane følgjer pakken med det same.
 */
export async function velgPakke(admin: SupabaseClient, companyId: string, pakkeId: string): Promise<{ pakke: Pakke }> {
  const pakke = finnPakke(pakkeId);
  if (!pakke) throw new Error("Ukjent pakke.");

  const no = new Date().toISOString();
  const felt = {
    company_id: companyId,
    package_id: pakke.id,
    plan_id: pakke.id,
    billing_interval: pakke.interval,
    price_nok: pakke.priceNok,
    included_units: pakke.includedUnits,
    unit_prices: pakke.unitPriceNok,
    included_app_users: pakke.includedAppUsers,
    app_user_price_nok: pakke.appUserPriceNok,
    started_at: no,
    cancel_at_period_end: false,
    updated_at: no,
  };
  const { data: eksisterande } = await admin.from("subscriptions").select("id").eq("company_id", companyId).maybeSingle();
  const { error } = eksisterande
    ? await admin.from("subscriptions").update(felt).eq("id", eksisterande.id)
    : await admin.from("subscriptions").insert(felt);
  if (error) throw new Error(error.message);

  await oppdaterModular(admin, companyId);
  return { pakke };
}

/** Seier opp med verknad frå periodeslutt. Nattjobben avsluttar når perioden er ute. */
export async function seiOppPakke(admin: SupabaseClient, companyId: string, angre = false): Promise<void> {
  const { error } = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: !angre, updated_at: new Date().toISOString() })
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/**
 * Avsluttar oppsagde abonnement der perioden er ute, og speglar modulane.
 * Kallast frå nattjobben. Returnerer selskapa som mista pakken.
 */
export async function avsluttOppsagde(admin: SupabaseClient, no: Date = new Date()): Promise<string[]> {
  const { data: rader } = await admin.from("subscriptions").select("*").eq("cancel_at_period_end", true);
  const ferdige: string[] = [];
  for (const rad of rader ?? []) {
    const a = tilAbonnement(rad as Record<string, unknown>);
    const periode = gjeldandePeriode(a.startedAt, no, a.interval);
    // Perioden som gjeld no starta etter oppseiinga vart lagt inn? Nei —
    // enklare og rett: rada seiast opp «frå periodeslutt», så ho er ute når
    // perioden vi står i no ikkje lenger er den ho vart sagd opp i. Vi har
    // ikkje lagra kva periode det var; updated_at er tidspunktet oppseiinga
    // vart sett, og perioden som gjaldt då er den siste betalte.
    const sagdOppI = gjeldandePeriode(a.startedAt, new Date((rad as { updated_at: string }).updated_at), a.interval);
    if (periode.nummer <= sagdOppI.nummer) continue;
    const { error } = await admin.from("subscriptions").delete().eq("id", a.id);
    if (error) throw new Error(error.message);
    await oppdaterModular(admin, a.companyId);
    ferdige.push(a.companyId);
  }
  return ferdige;
}

// ---------------------------------------------------------------------------
// Teljing
// ---------------------------------------------------------------------------

/**
 * Tel éi eining: eit tilbod (per lead) eller ei faktura (per ordre).
 *
 * Idempotent per referanse: den unike indeksen gjer at same lead eller
 * ordre aldri blir talt to gonger, uansett kor mange gonger agenten køyrer
 * eller forslaget blir overført på nytt. Feilar skrivinga av ein annan
 * grunn, går arbeidet vidare som normalt — ein teljar som stoppar
 * produksjonen er verre enn ein teljar som bommar.
 */
export async function registrerBruk(
  admin: SupabaseClient,
  input: { companyId: string; kind: EiningSlag; referenceId?: string | null },
): Promise<void> {
  try {
    const { error } = await admin.from("usage_events").insert({
      company_id: input.companyId,
      kind: input.kind,
      agent_id: input.kind,
      reference_id: input.referenceId ?? null,
    });
    // 23505 = unik indeks. Referansen er talt før; det er meininga.
    if (error && error.code !== "23505") throw new Error(error.message);
  } catch (err) {
    console.warn("kunne ikke registrere forbruk:", err instanceof Error ? err.message : err);
  }
}

/**
 * Tel ein aktiv montør i appen: éin gong per brukar per kalendermånad
 * (UTC). Kallast frå skrive-rutene berre når kallet kom med bearer-token
 * — nettappen tel aldri. Same haldning til feil som registrerBruk.
 */
export async function registrerAppBrukar(admin: SupabaseClient, input: { companyId: string; userId: string }): Promise<void> {
  try {
    const { error } = await admin.from("usage_events").insert({
      company_id: input.companyId,
      kind: "app_bruker",
      agent_id: "app_bruker",
      user_id: input.userId,
      period_start: maanadStart(),
    });
    if (error && error.code !== "23505") throw new Error(error.message);
  } catch (err) {
    console.warn("kunne ikke registrere app-bruker:", err instanceof Error ? err.message : err);
  }
}
