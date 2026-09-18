/**
 * Prøve på malmotoren og dokumentasjonsmalene — uten database og uten
 * Playwright (bare HTML-strengen).
 *
 *   npm run test:dokumentasjon
 */
import { alleMalar, finnMal, malarForFag } from "@/lib/dokumentasjon/malar";
import type { DokumentData, Feltverdi, PrefillKontekst } from "@/lib/dokumentasjon/malar/typar";
import { manglandePaakravde, prefillData, rensData, validerMal } from "@/lib/dokumentasjon/motor";
import { renderDokumentHtml } from "@/lib/pdf/dokument-template";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

const CTX: PrefillKontekst = {
  company: { name: "Star Elektro AS", org_nr: "984447647", address: "Storgata 1, 5003 Bergen" },
  order: {
    order_no: 1001,
    title: "Utskifting av stikkontakter",
    description: "Bytte av 12 stikkontakter og 3 brytere i gang og stue.",
    customer_name: "Kari Nordmann",
    site_address: "Bjørkevegen 22, 5003 Bergen",
  },
  user: { name: "Ola Montør" },
  today: "2026-09-17",
};

// ---------------------------------------------------------------------------
// 1. Alle malene validerer
// ---------------------------------------------------------------------------
const malar = alleMalar();
sjekk("fem elektro-maler", malarForFag("elektro").length === 5, String(malarForFag("elektro").length));
sjekk("ukjent fag faller tilbake på elektro", malarForFag("ukjent").length === 5);
for (const m of malar) {
  const f = validerMal(m);
  sjekk(`mal ${m.key} validerer`, f.length === 0, f.join("; "));
}
sjekk("nøklene er unike", new Set(malar.map((m) => m.key)).size === malar.length);
sjekk("finnMal", finnMal("elektro.sluttkontroll")?.title === "Rapport fra sluttkontroll" && finnMal("x.y") === null);

// validerMal fanger dubletter
{
  const m = structuredClone(finnMal("elektro.samsvarserklaering")!);
  m.sections[0].fields.push({ key: "firma", label: "Igjen", type: "text" });
  sjekk("dublett feltnøkkel avvises", validerMal(m).some((f) => /brukt to ganger/.test(f)));
}

// ---------------------------------------------------------------------------
// 2. Prefill
// ---------------------------------------------------------------------------
{
  const m = finnMal("elektro.samsvarserklaering")!;
  const d = prefillData(m, CTX);
  sjekk("prefill firma", d.firma === "Star Elektro AS" && d.org_nr === "984447647");
  sjekk("prefill kunde og adresse", d.eier === "Kari Nordmann" && d.anleggsadresse === "Bjørkevegen 22, 5003 Bergen");
  sjekk("prefill omfang fra ordrebeskrivelse", String(d.omfang).startsWith("Bytte av 12"));
  sjekk("prefill dato", d.dato === "2026-09-17");
  sjekk("prefill ordrenummer som tekst", d.ordrenr === "1001");
  sjekk("checkbox starter false", d.risikovurdering_utfort === false);

  const u = prefillData(finnMal("elektro.utstyrsdokumentasjon")!, CTX);
  sjekk("standardtekst fylles", String(u.bruk).includes("jordfeilvern"));
  sjekk("repeat-seksjon får minRows tomme rader", Array.isArray(u.utstyr) && (u.utstyr as unknown[]).length === 1);
  sjekk("prefill montør", u.utfort_av === "Ola Montør");

  const utanBeskrivelse = prefillData(m, { ...CTX, order: { ...CTX.order, description: null } });
  sjekk("prefill uten beskrivelse gir tomt felt, ikke «null»", utanBeskrivelse.omfang === undefined);
}

// ---------------------------------------------------------------------------
// 3. required stopper «Fullfør»
// ---------------------------------------------------------------------------
{
  const m = finnMal("elektro.samsvarserklaering")!;
  const d = prefillData(m, CTX);
  const manglar = manglandePaakravde(m, d);
  sjekk("prefill alene er ikke nok", manglar.length > 0);
  sjekk("faglig ansvarlig mangler", manglar.some((x) => /Faglig ansvarlig/.test(x)));
  sjekk("avkryssing mangler", manglar.some((x) => /Risikovurdering er utført/.test(x)));

  const ferdig: DokumentData = {
    ...d,
    faglig_ansvarlig: "Roger",
    arbeidstype: "endring",
    ferdig_dato: "2026-09-16",
    standard: "NEK 400:2022",
    risikovurdering_utfort: true,
    sluttkontroll_utfort: true,
    kursfortegnelse_levert: true,
    utstyrsdok_levert: true,
  };
  sjekk("utfylt samsvarserklæring er klar", manglandePaakravde(m, ferdig).length === 0, manglandePaakravde(m, ferdig).join("; "));

  const k = finnMal("elektro.kursfortegnelse")!;
  const kd = prefillData(k, CTX);
  kd.fordeling = "Skap i gang";
  kd.hovedvern = "C63";
  kd.systemjording = "TN-C-S";
  kd.kursar = [];
  sjekk("kursfortegnelse med 0 rader feiler", manglandePaakravde(k, kd).some((x) => /minst 1 rad/.test(x)));
  kd.kursar = [{ kurs_nr: "1", vern: "B16", jordfeilvern: "A 30 mA", tverrsnitt: "3G2,5", forsyner: "Stikk stue", rom: "Stue", merknad: "" }];
  sjekk("kursfortegnelse med én full rad er klar", manglandePaakravde(k, kd).length === 0, manglandePaakravde(k, kd).join("; "));
  kd.kursar = [{ kurs_nr: "1", vern: "", jordfeilvern: "", tverrsnitt: "3G2,5", forsyner: "Stikk stue", rom: "", merknad: "" }];
  sjekk("tom påkrevd celle i rad rapporteres med radnummer", manglandePaakravde(k, kd).some((x) => /rad 1: Vern/.test(x)));

  const s = finnMal("elektro.sluttkontroll")!;
  const sd = prefillData(s, CTX);
  sjekk("sluttkontroll: check3 og measure er påkrevd", manglandePaakravde(s, sd).some((x) => /Kontinuitet/.test(x)) && manglandePaakravde(s, sd).some((x) => /Jording og utjevning/.test(x)));
}

// ---------------------------------------------------------------------------
// 4. rensData
// ---------------------------------------------------------------------------
{
  const s = finnMal("elektro.sluttkontroll")!;
  const r = rensData(s, { v_utstyr: "ok", v_kabel: "tull", m_kontinuitet: 0.3, ukjent: "x", konklusjon: "godkjent", fordelingssystem: "hack" });
  sjekk("check3 godtar bare ok/avvik/ia", r.v_utstyr === "ok" && r.v_kabel === "");
  sjekk("ukjente nøkler kastes", !("ukjent" in r));
  sjekk("select godtar bare kjente valg", r.konklusjon === "godkjent" && r.fordelingssystem === "");
  sjekk("tall beholdes", r.m_kontinuitet === 0.3);
  const k = finnMal("elektro.kursfortegnelse")!;
  const rk = rensData(k, { kursar: [{ kurs_nr: "1", vern: "B16", ekstra: "nei" }, "søppel"] });
  const rader = rk.kursar as Record<string, Feltverdi>[];
  sjekk("rader renses til malens felt", rader.length === 2 && rader[0].kurs_nr === "1" && !("ekstra" in rader[0]) && rader[1].kurs_nr === "");
}

// ---------------------------------------------------------------------------
// 5. PDF-HTML for hver mal
// ---------------------------------------------------------------------------
for (const m of malar) {
  const d = prefillData(m, CTX);
  if (m.key === "elektro.sluttkontroll") {
    d.v_utstyr = "ok";
    d.v_kabel = "avvik";
    d.v_kapsling = "ia";
    d.m_kontinuitet = "0.3";
  }
  if (m.key === "elektro.kursfortegnelse") {
    d.kursar = [{ kurs_nr: "1", vern: "B16", jordfeilvern: "A 30 mA", tverrsnitt: "3G2,5", forsyner: "Stikk <stue>", rom: "Stue", merknad: "" }];
  }
  let html = "";
  let ok = true;
  try {
    html = renderDokumentHtml({
      mal: m,
      data: d,
      brand: { primary_color: "#0a5" },
      companyName: "Star Elektro AS",
      orgNr: "984447647",
      ordre: { order_no: 1001, title: CTX.order.title, site_address: CTX.order.site_address, customer_name: CTX.order.customer_name },
      signatur: { name: "Ola Montør", at: "2026-09-17T12:32:00Z" },
    });
  } catch (err) {
    ok = false;
    sjekk(`PDF-HTML ${m.key}`, false, err instanceof Error ? err.message : String(err));
  }
  if (ok) {
    sjekk(`PDF-HTML ${m.key} rendrer med tittel og lovgrunnlag`, html.includes(m.title) && html.includes(m.lovgrunnlag) && html.includes("Signert i Devello av Ola Montør"));
  }
  if (ok && m.key === "elektro.sluttkontroll") {
    sjekk("check3 som ✓ / ✗ / –", html.includes("✓</span> OK") && html.includes("✗</span> Avvik") && html.includes("–</span> Ikke aktuelt"));
    sjekk("måleverdi med krav", html.includes("0.3 Ω") && html.includes("Krav: Lav og stabil"));
  }
  if (ok && m.key === "elektro.kursfortegnelse") {
    sjekk("tabell med rad, HTML escapet", html.includes("Stikk &lt;stue&gt;") && html.includes("<thead>"));
  }
}
{
  const m = finnMal("elektro.samsvarserklaering")!;
  const html = renderDokumentHtml({
    mal: m,
    data: prefillData(m, CTX),
    brand: {},
    companyName: "Star Elektro AS",
    orgNr: null,
    ordre: { order_no: 1001, title: "T", site_address: null, customer_name: "K" },
    signatur: null,
  });
  sjekk("utkast uten signatur merkes UTKAST", html.includes("UTKAST"));
}

console.log(feil === 0 ? "\nAlle sjekker grønne." : `\n${feil} sjekk(er) feilet.`);
process.exit(feil === 0 ? 0 : 1);
