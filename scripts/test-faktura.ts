/**
 * Prøve på fakturaforslaget — resolveren, omregningen og Go-payloaden.
 * Uten database og uten modell.
 *
 *   npm run test:faktura
 *
 * Fixturen: et fastpristilbud med 2 seksjoner og 5 linjer, 4 timeføringer
 * (2 typer, én ikke fakturerbar), 5 materiell-linjer (2 fra faktura, 1
 * erstattet, 1 ikke fakturerbar).
 */
import { byggSalsordre, manglandeProdukt } from "@/lib/faktura/go";
import { planTilLinjer, reknOmLinjer } from "@/lib/faktura/resolver";
import type { FakturaPlan, Kjelder } from "@/lib/faktura/typar";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

const KJELDER: Kjelder = {
  quote_type: "fastpris",
  vat_pct: 25,
  assumptions: ["Inntil 10 m fremlegg per kurs."],
  sections: [
    {
      id: "s1",
      title: "Materiell",
      lines: [
        { id: "s1-l1", section_id: "s1", description: "Elbillader 11 kW", quantity: 1, unit: "stk", unit_price: 8000, discount_pct: 0 },
        { id: "s1-l2", section_id: "s1", description: "Kabel PFXP 5G6", quantity: 15, unit: "m", unit_price: 60, discount_pct: 0 },
        { id: "s1-l3", section_id: "s1", description: "Jordfeilautomat B", quantity: 1, unit: "stk", unit_price: 1200, discount_pct: 10 },
      ],
    },
    {
      id: "s2",
      title: "Arbeid",
      lines: [
        { id: "s2-l1", section_id: "s2", description: "Montering elbillader", quantity: 6, unit: "t", unit_price: 950, discount_pct: 0 },
        { id: "s2-l2", section_id: "s2", description: "Samsvarserklæring", quantity: 1, unit: "stk", unit_price: 0, discount_pct: 0 },
      ],
    },
  ],
  timar: [
    { id: "t1", work_date: "2026-09-10", user_name: "Ola", time_type_name: "Elektriker", unit_price: 950, hours: 5, note: null, billable: true, invoiced: false },
    { id: "t2", work_date: "2026-09-11", user_name: "Ola", time_type_name: "Elektriker", unit_price: 950, hours: 2.5, note: "ekstra kurs varmekabel", billable: true, invoiced: false },
    { id: "t3", work_date: "2026-09-11", user_name: "Kari", time_type_name: "Lærling", unit_price: 550, hours: 4, note: null, billable: true, invoiced: false },
    { id: "t4", work_date: "2026-09-12", user_name: "Ola", time_type_name: "Elektriker", unit_price: 950, hours: 1, note: "garanti", billable: false, invoiced: false },
  ],
  materiell: [
    { id: "m1", source: "faktura", item_no: "1001234", name: "Kabel PFXP 3G2,5", quantity: 25, unit: "m", cost_price: 12, sale_price: 15, note: null, billable: true, replaced: false, invoiced: false, invoice_no: "48211" },
    { id: "m2", source: "faktura", item_no: "1234567", name: "Stikkontakt dobbel", quantity: 2, unit: "stk", cost_price: 80, sale_price: 100, note: null, billable: true, replaced: false, invoiced: false, invoice_no: "48211" },
    { id: "m3", source: "manuell", item_no: "1001234", name: "Kabel PFXP 3G2,5", quantity: 20, unit: "m", cost_price: 12, sale_price: 15, note: null, billable: true, replaced: true, invoiced: false, invoice_no: null },
    { id: "m4", source: "manuell", item_no: null, name: "Varmekabel 300 W", quantity: 1, unit: "stk", cost_price: 900, sale_price: 1125, note: "ikke i tilbudet", billable: true, replaced: false, invoiced: false, invoice_no: null },
    { id: "m5", source: "manuell", item_no: null, name: "Skruer", quantity: 1, unit: "pk", cost_price: 40, sale_price: 50, note: "eget lager", billable: false, replaced: false, invoiced: false, invoice_no: null },
  ],
};

// ---------------------------------------------------------------------------
// 1. Fastpris med tillegg
// ---------------------------------------------------------------------------
{
  const plan: FakturaPlan = {
    strategy: "fastpris_med_tillegg",
    lines: [
      { kind: "tilbod_seksjon", source_ids: ["s1"], description: "Materiell iht. tilbud", included: true, reason: null },
      { kind: "tilbod_seksjon", source_ids: ["s2"], description: "Montering iht. tilbud", included: true, reason: null },
    ],
    extras: [
      { kind: "timer", source_ids: ["t2"], description: "Arbeid utover tilbud: ekstra kurs til varmekabel", included: true, reason: "Notat sier ekstra kurs, ikke i tilbudet." },
      { kind: "materiell", source_ids: ["m4"], description: "", included: true, reason: "Ikke i tilbudet." },
    ],
    notes: [],
    questions: ["Var de 4 lærlingtimene innenfor tilbudet?"],
    invoice_text: "Montering av elbillader i garasje iht. tilbud.",
  };
  const r = planTilLinjer(plan, KJELDER);
  sjekk("fastpris_med_tillegg: ingen problemer", r.problems.length === 0, r.problems.join("; "));
  sjekk("fire linjer", r.lines.length === 4, String(r.lines.length));
  const s1 = r.lines[0];
  // 8000 + 15×60 + 1200×0,9 = 8000 + 900 + 1080 = 9980
  sjekk("seksjon 1 summert med rabatt", s1.unit_price === 9980 && s1.quantity === 1 && s1.line_total === 9980, JSON.stringify(s1));
  const s2 = r.lines[1];
  sjekk("seksjon 2 = 5700 (0-linje teller 0)", s2.unit_price === 5700, String(s2.unit_price));
  const t = r.lines[2];
  sjekk("tillegg timer: 2,5 t × 950", t.kind === "timer" && t.quantity === 2.5 && t.unit_price === 950 && t.line_total === 2375, JSON.stringify(t));
  const m = r.lines[3];
  sjekk("tillegg materiell: navn fra kilden, salgspris", m.description === "Varmekabel 300 W" && m.unit_price === 1125, JSON.stringify(m));
  sjekk("kilder peker riktig", s1.sources[0].type === "quote_section" && t.sources[0].id === "t2" && m.sources[0].type === "material_entry");
  // 9980 + 5700 + 2375 + 1125 = 19180; mva 4795; total 23975
  sjekk("summer", r.totals.subtotal === 19180 && r.totals.vat === 4795 && r.totals.total === 23975, JSON.stringify(r.totals));
}

// ---------------------------------------------------------------------------
// 2. Feil kilder → problems
// ---------------------------------------------------------------------------
{
  const plan: FakturaPlan = {
    strategy: "tid_og_materiell",
    lines: [
      { kind: "materiell", source_ids: ["m3"], description: "Kabel", included: true, reason: null },
      { kind: "materiell", source_ids: ["m5"], description: "Skruer", included: true, reason: null },
      { kind: "timer", source_ids: ["t4"], description: "Garanti", included: true, reason: null },
      { kind: "timer", source_ids: ["t99"], description: "Finnes ikke", included: true, reason: null },
      { kind: "materiell", source_ids: [], description: "Uten kilde", included: true, reason: null },
    ],
    extras: [],
    notes: [],
    questions: [],
    invoice_text: "",
  };
  const r = planTilLinjer(plan, KJELDER);
  sjekk("erstattet linje avvist", r.problems.some((p) => p.includes("m3") && /erstattet/.test(p)), r.problems.join("; "));
  sjekk("ikke fakturerbar materiell avvist", r.problems.some((p) => p.includes("m5")));
  sjekk("ikke fakturerbar time avvist", r.problems.some((p) => p.includes("t4")));
  sjekk("ukjent kilde avvist", r.problems.some((p) => p.includes("t99")));
  sjekk("linje uten kilde avvist", r.problems.some((p) => /mangler kilder/.test(p)));
  sjekk("ingen linjer ble laget av feilene", r.lines.length === 0, String(r.lines.length));
}

// ---------------------------------------------------------------------------
// 3. Strategi mot grunnlag, dobbeltbruk, tekstlinje
// ---------------------------------------------------------------------------
{
  const utanTilbod: Kjelder = { ...KJELDER, quote_type: null, sections: [], assumptions: [] };
  const r1 = planTilLinjer(
    { strategy: "fastpris", lines: [], extras: [], notes: [], questions: [], invoice_text: "" },
    utanTilbod,
  );
  sjekk("fastpris uten tilbud avvist", r1.problems.some((p) => /tid og materiell/.test(p)), r1.problems.join("; "));

  const r2 = planTilLinjer(
    {
      strategy: "fastpris_med_tillegg",
      lines: [{ kind: "tilbod_linje", source_ids: ["s1-l1", "s1-l2"], description: "", included: true, reason: null }],
      extras: [{ kind: "tilbod_linje", source_ids: ["s1-l1"], description: "Igjen", included: true, reason: "x" }],
      notes: [],
      questions: [],
      invoice_text: "",
    },
    KJELDER,
  );
  sjekk("samme kilde i lines og extras avvist", r2.problems.some((p) => /alt brukt/.test(p)), r2.problems.join("; "));
  sjekk("tilbod_linje med flere id-er gir én linje per id", r2.lines.filter((l) => l.kind === "tilbod_linje").length === 2);
  sjekk("tilbudslinje beholder egen beskrivelse ved flere id-er", r2.lines[0].description === "Elbillader 11 kW");

  const r3 = planTilLinjer(
    {
      strategy: "tid_og_materiell",
      lines: [
        { kind: "tekst", source_ids: [], description: "Arbeidet omfatter feilsøking i skap.", included: true, reason: null },
        { kind: "timer", source_ids: ["t1", "t2", "t3"], description: "Arbeid", included: true, reason: null },
        { kind: "materiell", source_ids: ["m1", "m2"], description: "Materiell", included: true, reason: null },
      ],
      extras: [],
      notes: [],
      questions: [],
      invoice_text: "Feilsøking og utbedring.",
    },
    KJELDER,
  );
  sjekk("tid og materiell: ingen problemer", r3.problems.length === 0, r3.problems.join("; "));
  const tekst = r3.lines.find((l) => l.kind === "tekst")!;
  sjekk("tekstlinje uten pris", tekst.unit_price === null && tekst.quantity === 0 && tekst.line_total === 0);
  const timer = r3.lines.filter((l) => l.kind === "timer");
  sjekk("timer gruppert per type og sats: to linjer", timer.length === 2, String(timer.length));
  const el = timer.find((l) => l.description.includes("Elektriker"))!;
  sjekk("elektriker 7,5 t", el.quantity === 7.5 && el.unit_price === 950 && el.sources.length === 2, JSON.stringify(el));
  const mat = r3.lines.filter((l) => l.kind === "materiell");
  sjekk("materiell én linje per kilde med navn", mat.length === 2 && mat[0].description === "Kabel PFXP 3G2,5" && mat[1].unit_price === 100);
  // 7,5×950 + 4×550 + 25×15 + 2×100 = 7125 + 2200 + 375 + 200 = 9900
  sjekk("summer uten tekstlinja", r3.totals.subtotal === 9900, String(r3.totals.subtotal));
}

// ---------------------------------------------------------------------------
// 4. Redigering: manuell pris, av/på, omregning
// ---------------------------------------------------------------------------
{
  const r = planTilLinjer(
    {
      strategy: "tid_og_materiell",
      lines: [
        { kind: "timer", source_ids: ["t1"], description: "Arbeid", included: true, reason: null },
        { kind: "materiell", source_ids: ["m2"], description: "", included: true, reason: null },
      ],
      extras: [],
      notes: [],
      questions: [],
      invoice_text: "",
    },
    KJELDER,
  );
  const redigert = r.lines.map((l, i) => (i === 0 ? { ...l, unit_price: 1000 } : { ...l, included: false }));
  const om = reknOmLinjer(redigert, r.lines);
  sjekk("endret pris → unit_price_manual", om.lines[0].unit_price_manual === true && om.lines[0].line_total === 5000, JSON.stringify(om.lines[0]));
  sjekk("uendret pris → ikke manuell", !om.lines[1].unit_price_manual);
  sjekk("linje tatt ut teller ikke", om.totals.subtotal === 5000 && om.totals.total === 6250, JSON.stringify(om.totals));
  const om2 = reknOmLinjer(om.lines, om.lines);
  sjekk("manuell-merket holder ved ny lagring", om2.lines[0].unit_price_manual === true);
}

// ---------------------------------------------------------------------------
// 5. Go-payload
// ---------------------------------------------------------------------------
{
  const r = planTilLinjer(
    {
      strategy: "fastpris_med_tillegg",
      lines: [{ kind: "tilbod_seksjon", source_ids: ["s1", "s2"], description: "Elbillader iht. tilbud", included: true, reason: null }],
      extras: [
        { kind: "timer", source_ids: ["t2"], description: "Ekstra kurs", included: true, reason: "x" },
        { kind: "materiell", source_ids: ["m4"], description: "", included: true, reason: "x" },
        { kind: "tekst", source_ids: [], description: "Merk: garantiarbeid er ikke fakturert.", included: true, reason: null },
        { kind: "materiell", source_ids: ["m1"], description: "", included: false, reason: "Innenfor tilbudet" },
      ],
      notes: [],
      questions: [],
      invoice_text: "Montering av elbillader.",
    },
    KJELDER,
  );
  sjekk("payload-grunnlag uten problemer", r.problems.length === 0, r.problems.join("; "));
  const draft = { id: "11111111-2222-3333-4444-555555555555", lines: r.lines, invoice_text: "Montering av elbillader.", customer_reference: "Kari" };
  const map = { arbeid: "DEV-ARB", materiell: "DEV-MAT", fastpris: "DEV-FAST", annet: "DEV-ANN" };
  sjekk("ingen manglende produkter med full mapping", manglandeProdukt(r.lines, map).length === 0);
  sjekk("mangler materiell uten den", manglandeProdukt(r.lines, { arbeid: "A", fastpris: "F" }).join(",") === "materiell");
  sjekk("annet kreves ikke når ingen tekstlinje har pris", !manglandeProdukt(r.lines, { arbeid: "A", fastpris: "F" }).includes("annet"));

  const dto = byggSalsordre({ draft, ordre: { order_no: 1001 }, customerNo: "10023", productMap: map, settings: { project_per_order: true }, dato: "2026-09-17" });
  sjekk("Draft, aldri Confirmed", dto.SalesOrderStatus === "Draft");
  sjekk("ExternalImportReference = utkastets id", dto.ExternalImportReference === draft.id);
  sjekk("kundenummer, referanser, prosjekt", dto.CustomerNo === "10023" && dto.CustomerReference === "Kari" && dto.PurchaseOrderReference === "Ordre 1001" && dto.ProjectCode === "1001");
  sjekk("fakturateksten er første tekstlinje", dto.SalesOrderLines[0].LineType === "Text" && dto.SalesOrderLines[0].Description === "Montering av elbillader.");
  const normal = dto.SalesOrderLines.filter((l) => l.LineType === "Normal");
  sjekk("tre Normal-linjer (linja som er tatt ut er ikke med)", normal.length === 3, String(normal.length));
  sjekk("produktkoder per type", normal[0].ProductCode === "DEV-FAST" && normal[1].ProductCode === "DEV-ARB" && normal[2].ProductCode === "DEV-MAT", JSON.stringify(normal.map((l) => l.ProductCode)));
  sjekk("mengde og pris fra linjene", normal[0].Quantity === 1 && normal[0].ProductUnitPrice === 15680 && normal[1].Quantity === 2.5);
  sjekk("tekstlinje uten pris → Text", dto.SalesOrderLines.some((l, i) => i > 0 && l.LineType === "Text" && /garantiarbeid/.test(l.Description)));
  sjekk("SortOrder stigende", dto.SalesOrderLines.every((l, i) => l.SortOrder === i + 1));

  const utenProsjekt = byggSalsordre({ draft, ordre: { order_no: 1001 }, customerNo: 5, productMap: map, settings: {} });
  sjekk("uten prosjekt per ordre: ingen ProjectCode", utenProsjekt.ProjectCode === undefined);

  let kasta = false;
  try {
    byggSalsordre({ draft, ordre: { order_no: 1001 }, customerNo: 5, productMap: { arbeid: "A" }, settings: {} });
  } catch {
    kasta = true;
  }
  sjekk("mangler mapping → kaster", kasta);
}

console.log(feil === 0 ? "\nAlle sjekker grønne." : `\n${feil} sjekk(er) feilet.`);
process.exit(feil === 0 ? 0 : 1);
