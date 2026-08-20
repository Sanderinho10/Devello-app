import {
  computeTotals,
  formatNok,
  type CompanyBrand,
  type QuoteDocument,
  type QuoteType,
} from "@/lib/types";

/**
 * Devellos faste PDF-mal.
 *
 * Dette er en Devello-mal med kundens logo, farge og kontaktinfo injisert —
 * ikke en etterligning av kundens gamle Word/PDF-layout. Samme mal for alle
 * kunder; bare merkevaren varierer.
 */
export function renderQuoteHtml(input: {
  document: QuoteDocument;
  quoteType: QuoteType;
  brand: Partial<CompanyBrand>;
  companyName: string;
  /** Logoen som data-URI. Se lib/pdf/logo.ts for hvorfor den ikke er en lenke. */
  logoSrc?: string | null;
  /** Avsenderadressen, hentet fra selskapet. */
  address?: { line: string | null; postalCode: string | null; city: string | null };
}): string {
  const { document: doc, brand, companyName, quoteType, logoSrc, address } = input;
  const totals = computeTotals(doc);
  const accent = brand.primary_color || "#1d1d1f";

  // Kontaktpersonen står bare når den er en ANNEN enn kunden. Feltet finnes
  // for bedriftskunder — «Nordvik Bygg AS» med «Ole Nordvik» under — og for
  // en privatperson er de samme navnet. Da skal navnet stå én gang.
  const kontaktperson =
    doc.customer.contact && !likeNavn(doc.customer.contact, doc.customer.name)
      ? doc.customer.contact
      : null;

  const brukteSeksjoner = doc.sections.filter((section) => section.lines.length > 0);
  // Delsummer bare når det faktisk er flere seksjoner. På et punktpristilbud
  // med én seksjon ville en delsum rett over totalen sagt det samme to ganger.
  const flereSeksjoner = brukteSeksjoner.length > 1;

  // Én tabell for hele tilbudet, ikke én per seksjon. Kolonneoverskriftene
  // hører til dokumentet, ikke til rommet — gjentatt over hver seksjon blir de
  // støy, og de spiser fire linjer på et tilbud med fire rom.
  const rader = brukteSeksjoner
    .map((section) => {
      const linjer = section.lines
        .map(
          (line) => `
          <tr>
            <td class="desc">${escapeHtml(line.description)}</td>
            <td class="qty">${formatQuantity(line.quantity)}</td>
            <td class="unit">${escapeHtml(line.unit)}</td>
            <td class="num">${formatNok(line.unit_price)}</td>
            <td class="num strong">${formatNok(line.quantity * line.unit_price)}</td>
          </tr>`,
        )
        .join("");

      if (!flereSeksjoner) return linjer;

      const delsum = section.lines.reduce(
        (sum, line) => sum + line.quantity * line.unit_price,
        0,
      );

      return `
        <tr class="group"><td colspan="5">${escapeHtml(section.title)}</td></tr>
        ${linjer}
        <tr class="subtotal">
          <td colspan="4" class="num">Sum ${escapeHtml(section.title.toLowerCase())} eks. mva</td>
          <td class="num">${formatNok(delsum)}</td>
        </tr>`;
    })
    .join("");

  const sections = rader
    ? `<table>
         <!--
           Beskrivelsen får all plassen som blir til overs. Tallkolonnene er
           satt til det innholdet faktisk krever — «1 890 kr» er åtte tegn, og
           en kolonne på 29 mm for det er 15 mm stjålet fra postteksten. Hver
           post som slipper å brekke til to linjer, er en post mer på arket.

           Bredden er et hint, ikke en tvang: tabellen legges ut automatisk, så
           et uvanlig stort beløp får plassen det trenger uansett.
         -->
         <colgroup>
           <col style="width:61%"><col style="width:8%"><col style="width:6%">
           <col style="width:12%"><col style="width:13%">
         </colgroup>
         <thead>
           <tr>
             <th>Beskrivelse</th>
             <th class="qty">Mengde</th>
             <th class="unit">Enh</th>
             <th class="num">Enh.pris</th>
             <th class="num">Beløp</th>
           </tr>
         </thead>
         <tbody>${rader}</tbody>
       </table>`
    : "";

  const assumptions = doc.assumptions.length
    ? `<section class="assumptions">
         <h3>Forutsetninger</h3>
         <ul>${doc.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
       </section>`
    : "";

  const contactLines = [
    brand.contact_name,
    brand.contact_email,
    brand.contact_phone,
    brand.website,
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(String(line))}</div>`)
    .join("");

  // Adressen eies av selskapet, ikke av merkevaren — den skal være den samme
  // enten den står på en faktura fra oss eller øverst i et tilbud fra dem.
  const addressLines = [
    address?.line,
    [address?.postalCode, address?.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(String(line))}</div>`)
    .join("");

  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title)}</title>
<style>
  /*
   * Tett sats med vilje.
   *
   * Et tilbud som går over to sider blir lest som to dokumenter — kunden ser
   * totalen på side to og har glemt hva den dekker. Derfor små marger, 9 pt
   * og stram linjeavstand: så mye av jobben som mulig på ett ark, uten at det
   * blir trangt å lese.
   */
  @page { size: A4; margin: 13mm 14mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.35;
    color: #1d1d1f;
    margin: 0;
    -webkit-font-smoothing: antialiased;
  }

  /* Avsender */
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 8px;
    border-bottom: 2px solid ${accent};
  }
  .logo { max-height: 42px; max-width: 180px; }
  .sender-name { font-size: 12pt; font-weight: 600; letter-spacing: -0.01em; }
  .sender { text-align: right; font-size: 7.5pt; color: #6e6e73; line-height: 1.3; }

  /* Overskrift — tydeligere enn en løpende setning. */
  h1 {
    font-size: 19pt;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.15;
    margin: 13px 0 2px;
  }
  .subtitle {
    color: #86868b;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 10px;
  }

  /* Kunde og datoer */
  .meta {
    display: flex;
    gap: 28px;
    padding: 7px 0;
    border-top: 1px solid #e8e8ed;
    border-bottom: 1px solid #e8e8ed;
    margin-bottom: 10px;
    font-size: 8.5pt;
  }
  .meta > div { flex: 1; }
  .meta .label {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #86868b;
    margin-bottom: 2px;
  }
  .meta .rows { display: flex; gap: 22px; }

  /* Poster */
  h3 {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #86868b;
    margin: 14px 0 3px;
    font-weight: 600;
    /* En seksjonstittel alene nederst på en side hjelper ingen. */
    break-after: avoid;
  }
  table { width: 100%; border-collapse: collapse; }
  /* Går tilbudet over to sider, skal kolonnene stå på begge. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th {
    text-align: left;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: #86868b;
    padding: 4px 0;
    border-bottom: 1px solid #d2d2d7;
  }
  td { padding: 2.6px 0; border-bottom: 1px solid #f2f2f5; vertical-align: top; }
  td.desc { padding-right: 12px; }
  .num { text-align: right; white-space: nowrap; }
  /* Mengde høyrejustert mot enheten, med luft imellom — ellers leses
     «1» og «stk» som ett ord. */
  .qty { text-align: right; padding-right: 6px; padding-left: 10px; white-space: nowrap; }
  .unit { text-align: left; color: #6e6e73; white-space: nowrap; }
  /* Luft foran tallene, så kolonnene ikke klistrer seg sammen når de smalnes. */
  td.num, th.num { padding-left: 10px; }
  .strong { font-weight: 600; }

  /* Seksjonsrad inne i tabellen: rommet eller delen jobben er delt i. */
  tr.group td {
    padding: 8px 0 2px;
    border-bottom: 1px solid #e8e8ed;
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #86868b;
  }
  tr.group:first-child td { padding-top: 4px; }

  tr.subtotal td {
    border-bottom: none;
    padding-top: 4px;
    padding-bottom: 1px;
    font-weight: 600;
    font-size: 8.5pt;
  }

  /* Summer */
  .totals {
    margin-top: 9px;
    margin-left: auto;
    width: 52%;
    break-inside: avoid;
  }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .row.grand {
    border-top: 2px solid ${accent};
    margin-top: 4px;
    padding-top: 8px;
    font-size: 12pt;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .totals .muted { color: #6e6e73; }

  /* Forutsetninger */
  .assumptions { margin-top: 14px; break-inside: avoid; }
  .assumptions ul { margin: 0; padding-left: 14px; }
  .assumptions li { margin-bottom: 1px; font-size: 8.5pt; }

  footer {
    margin-top: 16px;
    padding-top: 7px;
    border-top: 1px solid #e8e8ed;
    font-size: 7.5pt;
    color: #86868b;
    white-space: pre-wrap;
  }
</style>
</head>
<body>
  <header>
    <div>
      ${
        logoSrc
          ? `<img class="logo" src="${escapeAttr(logoSrc)}" alt="${escapeAttr(companyName)}">`
          : `<div class="sender-name">${escapeHtml(companyName)}</div>`
      }
    </div>
    <div class="sender">
      ${logoSrc ? `<div class="sender-name">${escapeHtml(companyName)}</div>` : ""}
      ${addressLines}
      ${contactLines}
    </div>
  </header>

  <h1>${escapeHtml(doc.title)}</h1>
  <div class="subtitle">${quoteTypeLabel(quoteType)}</div>

  <div class="meta">
    <div>
      <div class="label">Kunde</div>
      <div class="strong">${escapeHtml(doc.customer.name)}</div>
      ${kontaktperson ? `<div>${escapeHtml(kontaktperson)}</div>` : ""}
      ${doc.customer.address ? `<div>${escapeHtml(doc.customer.address)}</div>` : ""}
      ${doc.customer.email ? `<div>${escapeHtml(doc.customer.email)}</div>` : ""}
      ${doc.customer.phone ? `<div>${escapeHtml(doc.customer.phone)}</div>` : ""}
    </div>
    <div class="rows">
      <div>
        <div class="label">Dato</div>
        <div>${formatDateNo(new Date().toISOString())}</div>
      </div>
      <div>
        <div class="label">Gyldig til</div>
        <div>${doc.valid_until ? formatDateNo(doc.valid_until) : "—"}</div>
      </div>
    </div>
  </div>

  ${sections}

  <div class="totals">
    <div class="row"><span class="muted">Sum eks. mva</span><span>${formatNok(totals.subtotal)}</span></div>
    <div class="row"><span class="muted">Mva ${doc.vat_rate} %</span><span>${formatNok(totals.vat)}</span></div>
    <div class="row grand"><span>Total</span><span>${formatNok(totals.total)}</span></div>
  </div>

  ${assumptions}

  ${brand.footer_note ? `<footer>${escapeHtml(brand.footer_note)}</footer>` : ""}
</body>
</html>`;
}

/**
 * Undertittelen er en etikett, ikke en setning.
 *
 * Forklaringen på hva en punktpris er hører hjemme i e-posten, der det er
 * plass til å si det ordentlig. Her stjeler den bare plass fra postene.
 */
function quoteTypeLabel(type: QuoteType): string {
  return type === "punktpris" ? "Pristilbud — punktpris" : "Pristilbud — fastpris";
}

/** «Ole Nordvik» og «ole  nordvik» er samme person. */
function likeNavn(a: string, b: string): boolean {
  const rens = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  return rens(a) === rens(b);
}

function formatQuantity(n: number): string {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n);
}

function formatDateNo(iso: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
