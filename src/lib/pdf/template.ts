import {
  computeTotals,
  formatNok,
  type CompanyBrand,
  type QuoteDocument,
  type QuoteType,
} from "@/lib/types";

/**
 * Devello sin faste PDF-mal.
 *
 * Dette er ein Devello-mal med kundens logo, farge og kontaktinfo injisert —
 * ikkje ei etterlikning av kundens gamle Word/PDF-layout. Same mal for alle
 * kundar; berre merkevara varierer.
 */
export function renderQuoteHtml(input: {
  document: QuoteDocument;
  quoteType: QuoteType;
  brand: Partial<CompanyBrand>;
  companyName: string;
}): string {
  const { document: doc, brand, companyName, quoteType } = input;
  const totals = computeTotals(doc);
  const accent = brand.primary_color || "#1d1d1f";

  const sections = doc.sections
    .filter((section) => section.lines.length > 0)
    .map((section) => {
      const rows = section.lines
        .map(
          (line) => `
          <tr>
            <td class="desc">${escapeHtml(line.description)}</td>
            <td class="num">${formatQuantity(line.quantity)} ${escapeHtml(line.unit)}</td>
            <td class="num">${formatNok(line.unit_price)}</td>
            <td class="num strong">${formatNok(line.quantity * line.unit_price)}</td>
          </tr>`,
        )
        .join("");

      return `
        <section class="lines">
          ${doc.sections.length > 1 ? `<h3>${escapeHtml(section.title)}</h3>` : ""}
          <table>
            <thead>
              <tr>
                <th>Post</th>
                <th class="num">Antal</th>
                <th class="num">Einingspris</th>
                <th class="num">Sum</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    })
    .join("");

  const assumptions = doc.assumptions.length
    ? `<section class="assumptions">
         <h3>Føresetnader</h3>
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

  const addressLines = [
    brand.address_line,
    [brand.postal_code, brand.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(String(line))}</div>`)
    .join("");

  return `<!doctype html>
<html lang="nn">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1d1d1f;
    margin: 0;
    -webkit-font-smoothing: antialiased;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 18px;
    border-bottom: 2px solid ${accent};
  }
  .logo { max-height: 46px; max-width: 190px; }
  .sender-name { font-size: 15pt; font-weight: 600; letter-spacing: -0.01em; }
  .sender { text-align: right; font-size: 9pt; color: #6e6e73; line-height: 1.5; }
  h1 {
    font-size: 20pt;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 30px 0 4px;
  }
  .subtitle { color: #6e6e73; font-size: 9.5pt; margin-bottom: 26px; }
  .meta {
    display: flex;
    gap: 40px;
    padding: 16px 0;
    border-top: 1px solid #e8e8ed;
    border-bottom: 1px solid #e8e8ed;
    margin-bottom: 26px;
  }
  .meta > div { flex: 1; }
  .meta .label {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #86868b;
    margin-bottom: 4px;
  }
  .intro { margin-bottom: 26px; white-space: pre-wrap; }
  h3 {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #86868b;
    margin: 24px 0 8px;
    font-weight: 600;
  }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    font-size: 8.5pt;
    font-weight: 600;
    color: #86868b;
    padding: 8px 0;
    border-bottom: 1px solid #e8e8ed;
  }
  td { padding: 9px 0; border-bottom: 1px solid #f2f2f5; vertical-align: top; }
  td.desc { padding-right: 16px; }
  .num { text-align: right; white-space: nowrap; }
  th.num { text-align: right; }
  .strong { font-weight: 600; }
  .totals { margin-top: 22px; margin-left: auto; width: 58%; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; }
  .totals .row.grand {
    border-top: 2px solid ${accent};
    margin-top: 6px;
    padding-top: 12px;
    font-size: 13pt;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .totals .muted { color: #6e6e73; }
  .assumptions { margin-top: 30px; }
  .assumptions ul { margin: 0; padding-left: 18px; }
  .assumptions li { margin-bottom: 5px; }
  footer {
    margin-top: 40px;
    padding-top: 14px;
    border-top: 1px solid #e8e8ed;
    font-size: 8.5pt;
    color: #86868b;
    white-space: pre-wrap;
  }
</style>
</head>
<body>
  <header>
    <div>
      ${
        brand.logo_url
          ? `<img class="logo" src="${escapeAttr(brand.logo_url)}" alt="${escapeAttr(companyName)}">`
          : `<div class="sender-name">${escapeHtml(companyName)}</div>`
      }
    </div>
    <div class="sender">
      ${brand.logo_url ? `<div class="sender-name">${escapeHtml(companyName)}</div>` : ""}
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
      ${doc.customer.contact ? `<div>${escapeHtml(doc.customer.contact)}</div>` : ""}
      ${doc.customer.address ? `<div>${escapeHtml(doc.customer.address)}</div>` : ""}
      ${doc.customer.email ? `<div>${escapeHtml(doc.customer.email)}</div>` : ""}
      ${doc.customer.phone ? `<div>${escapeHtml(doc.customer.phone)}</div>` : ""}
    </div>
    <div>
      <div class="label">Dato</div>
      <div>${formatDateNo(new Date().toISOString())}</div>
      <div class="label" style="margin-top:12px">Gyldig til</div>
      <div>${doc.valid_until ? formatDateNo(doc.valid_until) : "—"}</div>
    </div>
  </div>

  <div class="intro">${escapeHtml(doc.intro)}</div>

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

function quoteTypeLabel(type: QuoteType): string {
  return type === "punktpris"
    ? "Tilbod — punktpris. Kvar post inkluderer arbeid og materiell."
    : "Tilbod — fastpris. Materiell og arbeid spesifisert kvar for seg.";
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
