import type { DokumentData, Felt, Feltverdi, Mal, Seksjon } from "@/lib/dokumentasjon/malar/typar";
import type { CompanyBrand } from "@/lib/types";

/**
 * PDF-malen for dokumentasjon — samme motor og samme merkevare som
 * tilbudet, men et annet dokument: seksjoner som tabeller, kontrollpunkt
 * som ✓ / ✗ / –, måleverdier med kravet ved siden av, og en signaturblokk
 * som sier hvem som fullførte det i Devello og når.
 *
 * Utformingen er vår egen. Innholdet er det FEL og NEK 400 krever.
 */
export function renderDokumentHtml(input: {
  mal: Mal;
  data: DokumentData;
  brand: Partial<CompanyBrand>;
  companyName: string;
  orgNr: string | null;
  logoSrc?: string | null;
  address?: { line: string | null; postalCode: string | null; city: string | null };
  ordre: { order_no: number; title: string; site_address: string | null; customer_name: string };
  signatur: { name: string; at: string } | null;
}): string {
  const { mal, data, brand, companyName, logoSrc, address, ordre, signatur } = input;
  const accent = brand.primary_color || "#1d1d1f";

  const seksjoner = mal.sections.map((s) => (s.repeat ? tabellSeksjon(s, data) : feltSeksjon(s, data))).join("");

  const addressLines = [address?.line, [address?.postalCode, address?.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .map((l) => `<div>${esc(String(l))}</div>`)
    .join("");
  const contactLines = [brand.contact_name, brand.contact_email, brand.contact_phone, brand.website]
    .filter(Boolean)
    .map((l) => `<div>${esc(String(l))}</div>`)
    .join("");

  const signaturBlokk = signatur
    ? `<section class="signatur">
         <div class="label">${esc(mal.signature.label)}</div>
         <div class="navn">${esc(signatur.name)}</div>
         <div class="stempel">Signert i Devello av ${esc(signatur.name)}, ${formatDatoTid(signatur.at)}</div>
       </section>`
    : `<section class="signatur utkast">
         <div class="label">${esc(mal.signature.label)}</div>
         <div class="stempel">UTKAST — ikke fullført og signert</div>
       </section>`;

  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<title>${esc(mal.title)} — ordre ${ordre.order_no}</title>
<style>
  @page { size: A4; margin: 13mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 9pt; line-height: 1.35; color: #1d1d1f; margin: 0;
    -webkit-font-smoothing: antialiased;
  }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 2px solid ${accent}; }
  .logo { max-height: 42px; max-width: 180px; }
  .sender-name { font-size: 12pt; font-weight: 600; letter-spacing: -0.01em; }
  .sender { text-align: right; font-size: 7.5pt; color: #6e6e73; line-height: 1.3; }
  h1 { font-size: 18pt; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15; margin: 13px 0 2px; }
  .subtitle { color: #86868b; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px; }
  .meta { display: flex; gap: 28px; padding: 7px 0; border-top: 1px solid #e8e8ed; border-bottom: 1px solid #e8e8ed; margin-bottom: 8px; font-size: 8.5pt; }
  .meta > div { flex: 1; }
  .label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; color: #86868b; margin-bottom: 2px; }
  .strong { font-weight: 600; }
  h3 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #86868b; margin: 14px 0 3px; font-weight: 600; break-after: avoid; }
  .help { font-size: 8pt; color: #6e6e73; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; color: #86868b; padding: 4px 0; border-bottom: 1px solid #d2d2d7; }
  td { padding: 3px 0; border-bottom: 1px solid #f2f2f5; vertical-align: top; }
  td.felt { width: 46%; padding-right: 12px; color: #3a3a3c; }
  td.verdi { white-space: pre-wrap; }
  td.krav { width: 34%; color: #6e6e73; font-size: 8pt; padding-left: 10px; }
  .c3 { display: inline-block; min-width: 18px; font-weight: 700; }
  .c3.ok { color: #1f7a3a; }
  .c3.avvik { color: #a4271b; }
  .c3.ia { color: #86868b; }
  .tabell td { padding: 3px 6px 3px 0; font-size: 8.5pt; }
  .signatur { margin-top: 22px; padding-top: 10px; border-top: 1px solid #d2d2d7; break-inside: avoid; width: 60%; }
  .signatur .navn { font-size: 12pt; font-weight: 600; margin: 4px 0 2px; }
  .signatur .stempel { font-size: 8pt; color: #6e6e73; }
  .signatur.utkast .stempel { color: #a4271b; font-weight: 600; }
  footer { margin-top: 16px; padding-top: 7px; border-top: 1px solid #e8e8ed; font-size: 7.5pt; color: #86868b; }
</style>
</head>
<body>
  <header>
    <div>${logoSrc ? `<img class="logo" src="${escAttr(logoSrc)}" alt="${escAttr(companyName)}">` : `<div class="sender-name">${esc(companyName)}</div>`}</div>
    <div class="sender">
      ${logoSrc ? `<div class="sender-name">${esc(companyName)}</div>` : ""}
      ${addressLines}
      ${contactLines}
    </div>
  </header>

  <h1>${esc(mal.title)}</h1>
  <div class="subtitle">${esc(mal.lovgrunnlag)}</div>

  <div class="meta">
    <div>
      <div class="label">Anlegg</div>
      <div class="strong">${esc(ordre.site_address ?? "—")}</div>
      <div>${esc(ordre.customer_name)}</div>
    </div>
    <div>
      <div class="label">Ordre</div>
      <div class="strong">#${ordre.order_no}</div>
      <div>${esc(ordre.title)}</div>
    </div>
  </div>

  ${seksjoner}
  ${signaturBlokk}

  <footer>${esc(companyName)}${input.orgNr ? ` · org.nr. ${esc(input.orgNr)}` : ""}${brand.footer_note ? ` · ${esc(brand.footer_note)}` : ""}</footer>
</body>
</html>`;
}

function feltSeksjon(s: Seksjon, data: DokumentData): string {
  const rader = s.fields
    .map((f) => {
      const v = data[f.key] as Feltverdi | undefined;
      if (f.type === "measure") {
        return `<tr><td class="felt">${esc(f.label)}</td><td class="verdi">${verdi(f, v)}</td><td class="krav">${f.limit ? `Krav: ${esc(f.limit)}` : ""}</td></tr>`;
      }
      return `<tr><td class="felt">${esc(f.label)}</td><td class="verdi" colspan="2">${verdi(f, v)}</td></tr>`;
    })
    .join("");
  return `<h3>${esc(s.title)}</h3>${s.help ? `<p class="help">${esc(s.help)}</p>` : ""}<table><tbody>${rader}</tbody></table>`;
}

function tabellSeksjon(s: Seksjon, data: DokumentData): string {
  const rader = Array.isArray(data[s.key]) ? (data[s.key] as Record<string, Feltverdi>[]) : [];
  const hode = s.fields.map((f) => `<th>${esc(f.label)}</th>`).join("");
  const kropp = rader.length
    ? rader.map((r) => `<tr>${s.fields.map((f) => `<td>${verdi(f, r[f.key])}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${s.fields.length}" style="color:#86868b">Ingen rader</td></tr>`;
  return `<h3>${esc(s.title)}</h3>${s.help ? `<p class="help">${esc(s.help)}</p>` : ""}<table class="tabell"><thead><tr>${hode}</tr></thead><tbody>${kropp}</tbody></table>`;
}

function verdi(f: Felt, v: Feltverdi | undefined): string {
  if (f.type === "checkbox") return v === true ? `<span class="c3 ok">✓</span>` : `<span class="c3 ia">–</span>`;
  if (f.type === "check3") {
    if (v === "ok") return `<span class="c3 ok">✓</span> OK`;
    if (v === "avvik") return `<span class="c3 avvik">✗</span> Avvik`;
    if (v === "ia") return `<span class="c3 ia">–</span> Ikke aktuelt`;
    return `<span class="c3 ia">·</span>`;
  }
  if (v === null || v === undefined || String(v).trim() === "") return `<span style="color:#86868b">—</span>`;
  if (f.type === "select") {
    const o = f.options.find((x) => x.value === String(v));
    return esc(o?.label ?? String(v));
  }
  if (f.type === "date") return esc(formatDato(String(v)));
  if (f.type === "measure" || f.type === "number") return `${esc(String(v))}${f.unit ? ` ${esc(f.unit)}` : ""}`;
  return esc(String(v));
}

function formatDato(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function formatDatoTid(iso: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  }).format(new Date(iso));
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(v: string): string {
  return esc(v).replace(/"/g, "&quot;");
}
