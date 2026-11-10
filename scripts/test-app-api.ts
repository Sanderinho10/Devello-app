/**
 * Montørapp-API-et, mot en kjørende server — som appen ville brukt det.
 *
 *   npm run dev            (i ett vindu)
 *   npm run test:app-api   (i et annet)
 *
 * Logger inn med TEST_EMAIL/TEST_PASSWORD via Supabase Auth (bearer, ikke
 * cookies) og går gjennom kontrakten i docs/montorapp-api.md: meg, ordreliste,
 * ordre, idempotente føringer (timer, materiell, notat, bilde), signert
 * bildelenke, strekkodesøk og rettigheter. Se docs/utvikleroppsett.md for
 * testbrukeren. Skriver i testselskapet og rydder ikke opp.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BASE = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
if (!URL_ || !ANON || !EMAIL || !PASSWORD) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_EMAIL eller TEST_PASSWORD i .env.local. Se docs/utvikleroppsett.md.");
  process.exit(2);
}

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}
function hopp(navn: string, kvifor: string) {
  console.log(`– ${navn} (hoppet over: ${kvifor})`);
}

async function loggInn(email: string, password: string): Promise<string> {
  const supabase = createClient(URL_!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Innlogging feilet for ${email}: ${error?.message ?? "ingen sesjon"}`);
  return data.session.access_token;
}

type Svar = { status: number; body: Record<string, unknown> & { error?: string } };
async function kall(token: string | null, metode: string, sti: string, body?: unknown | FormData): Promise<Svar> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let data: BodyInit | undefined;
  if (body instanceof FormData) data = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    data = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${sti}`, { method: metode, headers, body: data, redirect: "manual" });
  const tekst = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(tekst);
  } catch {
    parsed = { error: `Ikke JSON (${res.status}): ${tekst.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 120)}` };
  }
  return { status: res.status, body: parsed };
}

const token = await loggInn(EMAIL, PASSWORD);

// meg ----------------------------------------------------------------------
const meg = await kall(token, "GET", "/api/app/meg");
sjekk("GET /api/app/meg → 200", meg.status === 200, JSON.stringify(meg.body).slice(0, 200));
const timetyper = (meg.body.timetyper as { id: string; name: string; unit_price: number }[] | undefined) ?? [];
sjekk("meg: bruker, selskap, api_version 1", Boolean((meg.body.user as { id?: string })?.id) && Boolean((meg.body.company as { id?: string })?.id) && meg.body.api_version === 1);
sjekk("meg: minst én timetype (legg inn en aktiv «time»-rad i en aktiv prisliste)", timetyper.length > 0);
const rolle = (meg.body.user as { role?: string })?.role;

sjekk("uten Authorization → 401", (await kall(null, "GET", "/api/app/meg")).status === 401);
sjekk("med tulletoken → 401", (await kall("ikke.et.jwt", "GET", "/api/app/meg")).status === 401);
sjekk("med utgått-liknende JWT → 401", (await kall("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", "GET", "/api/app/meg")).status === 401);

// ordreliste ---------------------------------------------------------------
const liste = await kall(token, "GET", "/api/app/ordrar?status=aktive");
sjekk("GET /api/app/ordrar → 200", liste.status === 200, JSON.stringify(liste.body).slice(0, 200));
// Testen fører på sin egen ordre «Test montørapp», aldri på en ekte.
type OrdreRad = { id: string; order_no: number; status: string; title: string };
const TEST_TITTEL = "Test montørapp";
let ordrar = (liste.body.ordrar as OrdreRad[] | undefined) ?? [];
let ordre = ordrar.find((o) => o.title === TEST_TITTEL);
if (!ordre) {
  const ny = await kall(token, "POST", "/api/orders", { title: TEST_TITTEL, customer_name: "Testkunde" });
  sjekk("POST /api/orders (testordre) → 201", ny.status === 201, JSON.stringify(ny.body));
  const igjen = await kall(token, "GET", "/api/app/ordrar?status=aktive");
  ordrar = (igjen.body.ordrar as OrdreRad[]) ?? [];
  ordre = ordrar.find((o) => o.id === ny.body.id);
}
sjekk(`testordren «${TEST_TITTEL}» finnes i lista`, Boolean(ordre));
if (!ordre) {
  console.log(`\n${feil} feil.`);
  process.exit(1);
}
const sok = await kall(token, "GET", `/api/app/ordrar?q=${ordre.order_no}`);
sjekk("q=ordrenummer treffer ordren", ((sok.body.ordrar as { id: string }[]) ?? []).some((o) => o.id === ordre.id));

// timer --------------------------------------------------------------------
if (timetyper.length) {
  const clientId = randomUUID();
  const body = { work_date: new Date().toISOString().slice(0, 10), price_item_id: timetyper[0].id, hours: 1.5, note: "test:app-api", client_id: clientId };
  const t1 = await kall(token, "POST", `/api/orders/${ordre.id}/timer`, body);
  sjekk("POST timer med client_id → 201", t1.status === 201, JSON.stringify(t1.body).slice(0, 200));
  const t2 = await kall(token, "POST", `/api/orders/${ordre.id}/timer`, body);
  sjekk("samme body igjen → 200 med samme id", t2.status === 200 && t2.body.id === t1.body.id, `${t2.status} ${t2.body.id} vs ${t1.body.id}`);
  const t3 = await kall(token, "POST", `/api/orders/${ordre.id}/timer`, { ...body, hours: 99 });
  sjekk("samme client_id med annen (ugyldig) body → fortsatt 200, samme rad", t3.status === 200 && t3.body.id === t1.body.id);
  const detalj = await kall(token, "GET", `/api/app/ordrar/${ordre.id}`);
  const timer = (detalj.body.timer as { id: string; user_name: string }[]) ?? [];
  sjekk("GET /api/app/ordrar/[id]: føringen finnes nøyaktig én gang, med user_name", timer.filter((t) => t.id === t1.body.id).length === 1 && Boolean(timer.find((t) => t.id === t1.body.id)?.user_name));
  sjekk("ordre uten quote_snapshot, med lovlege_overgangar", !("quote_snapshot" in ((detalj.body.ordre as object) ?? {})) && Array.isArray(detalj.body.lovlege_overgangar));
  const mine = await kall(token, "GET", "/api/app/ordrar?status=aktive");
  const rad = ((mine.body.ordrar as { id: string; mine_timar: number }[]) ?? []).find((o) => o.id === ordre.id);
  sjekk("mine_timar er summert på ordren", (rad?.mine_timar ?? 0) >= 1.5, String(rad?.mine_timar));
} else {
  hopp("timer", "ingen timetyper");
}

// materiell ----------------------------------------------------------------
{
  const clientId = randomUUID();
  const body = { name: "Testmateriell (test:app-api)", unit: "stk", quantity: 2, sale_price: 100, client_id: clientId };
  const m1 = await kall(token, "POST", `/api/orders/${ordre.id}/materiell`, body);
  sjekk("POST materiell fritekst med client_id → 201", m1.status === 201, JSON.stringify(m1.body).slice(0, 200));
  const m2 = await kall(token, "POST", `/api/orders/${ordre.id}/materiell`, body);
  sjekk("samme igjen → 200 samme id", m2.status === 200 && m2.body.id === m1.body.id);
  const detalj = await kall(token, "GET", `/api/app/ordrar/${ordre.id}`);
  sjekk("materiell finnes én gang på ordren", ((detalj.body.materiell as { id: string }[]) ?? []).filter((m) => m.id === m1.body.id).length === 1);
}

// notat + bilde ------------------------------------------------------------
let notatId: string | null = null;
{
  const clientId = randomUUID();
  const n1 = await kall(token, "POST", `/api/orders/${ordre.id}/notat`, { text: "Notat fra test:app-api", client_id: clientId });
  sjekk("POST notat → 201", n1.status === 201, JSON.stringify(n1.body).slice(0, 200));
  const n2 = await kall(token, "POST", `/api/orders/${ordre.id}/notat`, { text: "Notat fra test:app-api", client_id: clientId });
  sjekk("samme igjen → 200 samme id", n2.status === 200 && n2.body.id === n1.body.id);
  sjekk("tomt notat → 400", (await kall(token, "POST", `/api/orders/${ordre.id}/notat`, { text: "  " })).status === 400);
  notatId = (n1.body.id as string) ?? null;

  // 1×1 PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const docClient = randomUUID();
  const form = () => {
    const f = new FormData();
    f.append("file", new Blob([png], { type: "image/png" }), "test.png");
    f.append("title", "Testbilde");
    if (notatId) f.append("note_id", notatId);
    f.append("client_id", docClient);
    return f;
  };
  const d1 = await kall(token, "POST", `/api/orders/${ordre.id}/dokumenter`, form());
  sjekk("POST dokumenter (png + note_id + client_id) → 201", d1.status === 201, JSON.stringify(d1.body).slice(0, 200));
  const d2 = await kall(token, "POST", `/api/orders/${ordre.id}/dokumenter`, form());
  sjekk("samme igjen → 200 samme id", d2.status === 200 && d2.body.id === d1.body.id);
  sjekk("bildet har note_id", d1.body.note_id === notatId);

  const fil = await kall(token, "GET", `/api/orders/${ordre.id}/dokumenter/${d1.body.id}/fil?format=json`);
  sjekk("GET …/fil?format=json → { url, expires_in: 300 }", fil.status === 200 && typeof fil.body.url === "string" && fil.body.expires_in === 300, JSON.stringify(fil.body).slice(0, 200));
  if (typeof fil.body.url === "string") {
    const bilde = await fetch(fil.body.url);
    sjekk("den signerte lenka svarer 200 uten headers", bilde.status === 200 && (bilde.headers.get("content-type") ?? "").startsWith("image/"), `${bilde.status} ${bilde.headers.get("content-type")}`);
  }
  const feilNotat = new FormData();
  feilNotat.append("file", new Blob([png], { type: "image/png" }), "x.png");
  feilNotat.append("note_id", randomUUID());
  sjekk("note_id fra en annen ordre → 400", (await kall(token, "POST", `/api/orders/${ordre.id}/dokumenter`, feilNotat)).status === 400);

  const detalj = await kall(token, "GET", `/api/app/ordrar/${ordre.id}`);
  const notat = ((detalj.body.notat as { id: string; bilete: { id: string }[]; user_name: string }[]) ?? []).find((n) => n.id === notatId);
  sjekk("ordren viser notatet med bildet under notat[].bilete og user_name", Boolean(notat) && (notat?.bilete ?? []).some((b) => b.id === d1.body.id) && Boolean(notat?.user_name));
  sjekk("bildet er med i ordre.bilete", ((detalj.body.bilete as { id: string }[]) ?? []).some((b) => b.id === d1.body.id));
}

// strekkode ----------------------------------------------------------------
{
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const companyId = (meg.body.company as { id: string }).id;
  let gtin: string | null = null;
  if (service) {
    const admin = createClient(URL_!, service, { auth: { persistSession: false } });
    const { data } = await admin.from("supplier_items").select("gtin").eq("company_id", companyId).eq("active", true).not("gtin", "is", null).limit(1);
    gtin = (data?.[0]?.gtin as string | undefined) ?? null;
  }
  if (gtin) {
    const s = await kall(token, "GET", `/api/grossist/sok?q=${encodeURIComponent(gtin)}`);
    const items = (s.body.items as { gtin: string | null; supplier_id: string }[]) ?? [];
    sjekk("GET /api/grossist/sok?q=<GTIN> treffer varen først, med gtin og supplier_id", s.status === 200 && items[0]?.gtin === gtin && Boolean(items[0]?.supplier_id), JSON.stringify(s.body).slice(0, 200));
  } else {
    hopp("strekkodesøk", service ? "ingen katalogvare med GTIN i testselskapet" : "SUPABASE_SERVICE_ROLE_KEY mangler, fant ingen GTIN å prøve");
  }
}

// rettigheter: standardbruker og andres notat --------------------------------
{
  const email2 = process.env.TEST_EMAIL_2;
  const pw2 = process.env.TEST_PASSWORD_2;
  if (email2 && pw2 && notatId) {
    try {
      const token2 = await loggInn(email2, pw2);
      const meg2 = await kall(token2, "GET", "/api/app/meg");
      if ((meg2.body.user as { role?: string })?.role !== "standard") {
        hopp("andres notat → 403", "TEST_EMAIL_2 er ikke standardbruker");
      } else {
        const d = await kall(token2, "DELETE", `/api/orders/${ordre.id}/notat/${notatId}`);
        sjekk("standardbruker sletter andres notat → 403", d.status === 403, `${d.status} ${d.body.error}`);
      }
    } catch (err) {
      sjekk("innlogging for TEST_EMAIL_2", false, err instanceof Error ? err.message : String(err));
    }
  } else {
    hopp("andres notat → 403", "TEST_EMAIL_2/TEST_PASSWORD_2 ikke satt");
  }
  if (notatId) {
    const egen = await kall(token, "DELETE", `/api/orders/${ordre.id}/notat/${notatId}`);
    sjekk(`eget notat slettes (${rolle})`, egen.status === 200);
    sjekk("slettet notat → 404", (await kall(token, "DELETE", `/api/orders/${ordre.id}/notat/${notatId}`)).status === 404);
  }
}

console.log(feil === 0 ? "\nAlt i orden." : `\n${feil} feil.`);
process.exit(feil === 0 ? 0 : 1);
