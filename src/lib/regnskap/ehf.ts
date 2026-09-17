import { XMLParser } from "fast-xml-parser";

/**
 * EHF / Peppol BIS Billing 3.0 (UBL 2.1) — det vi leser fra en faktura.
 *
 * Ren funksjon: XML inn, hode og linjer ut. Ingen database. Alt som gjelder
 * ett selskap (hvilke ordrenumre som finnes, hvilke varer som står i
 * katalogen) hører hjemme i matching og sync.
 *
 * Det ene regnestykket som gjøres her er enhetsprisen: LineExtensionAmount
 * delt på mengden. Fakturaen kan ha linjerabatt (AllowanceCharge), og
 * LineExtensionAmount er summen ETTER rabatt — så vi regner aldri rabatten
 * selv. Er mengden oppgitt i HMT (100 meter), blir den regnet om til meter,
 * og prisen per meter — samme regel som grossistkatalogen.
 */

export type EhfEnhet = "stk" | "m" | "kg" | "l";

export interface EhfLinje {
  lineNo: string | null;
  name: string;
  description: string | null;
  note: string | null;
  /** SellersItemIdentification/ID, slik den står. */
  sellerItemId: string | null;
  /** Elnummer: sju siffer fra sellerItemId, ellers fra navn/beskrivelse. */
  elnr: string | null;
  gtin: string | null;
  quantity: number;
  unit: EhfEnhet;
  /** unitCode slik fakturaen sa det, for feilsøking. */
  unitCode: string | null;
  /** Netto per enhet eks. mva = lineTotal / quantity. */
  unitPrice: number;
  /** LineExtensionAmount — linjesum eks. mva etter linjerabatt. */
  lineTotal: number;
  vatPct: number | null;
  /** Linjenivå-ordrereferanse (samlefaktura), ellers null. */
  orderReference: string | null;
}

export interface EhfFaktura {
  type: "faktura" | "kreditnota";
  invoiceNo: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  note: string | null;
  buyerReference: string | null;
  orderReference: string | null;
  supplierName: string | null;
  supplierOrgNr: string | null;
  /** AccountingCustomerParty/Party/Contact/Name — «Deres ref» havner ofte her. */
  customerContactName: string | null;
  deliveryAddress: string | null;
  taxExclusiveAmount: number | null;
  payableAmount: number | null;
  lines: EhfLinje[];
}

const UNIT: Record<string, EhfEnhet> = {
  C62: "stk",
  H87: "stk",
  EA: "stk",
  PCE: "stk",
  NAR: "stk",
  MTR: "m",
  KGM: "kg",
  LTR: "l",
  HMT: "m",
};

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Alt som tekst: beløp og mengder parses selv, så «0160» ikke blir 160.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) =>
    name === "InvoiceLine" ||
    name === "CreditNoteLine" ||
    name === "AllowanceCharge" ||
    name === "AddressLine",
});

export function parseEhf(xml: string): EhfFaktura {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rot = (doc.Invoice ?? doc.CreditNote) as Record<string, unknown> | undefined;
  if (!rot) {
    throw new Error("Fant verken <Invoice> eller <CreditNote> i XML-en.");
  }
  const erKreditnota = doc.CreditNote !== undefined;

  const selger = sti(rot, "AccountingSupplierParty", "Party");
  const kjopar = sti(rot, "AccountingCustomerParty", "Party");
  const levering = sti(rot, "Delivery", "DeliveryLocation", "Address");
  const total = sti(rot, "LegalMonetaryTotal");

  const linjeNoder = ((erKreditnota ? rot.CreditNoteLine : rot.InvoiceLine) ?? []) as Record<
    string,
    unknown
  >[];

  return {
    type: erKreditnota ? "kreditnota" : "faktura",
    invoiceNo: tekst(rot.ID),
    issueDate: tekst(rot.IssueDate),
    dueDate: tekst(rot.DueDate),
    currency: tekst(rot.DocumentCurrencyCode),
    note: tekst(rot.Note),
    buyerReference: tekst(rot.BuyerReference),
    orderReference: tekst(sti(rot, "OrderReference")?.ID),
    supplierName:
      tekst(sti(selger, "PartyLegalEntity")?.RegistrationName) ??
      tekst(sti(selger, "PartyName")?.Name),
    supplierOrgNr: tekst(sti(selger, "PartyLegalEntity")?.CompanyID),
    customerContactName: tekst(sti(kjopar, "Contact")?.Name),
    deliveryAddress: adresse(levering),
    taxExclusiveAmount: tal(total?.TaxExclusiveAmount),
    payableAmount: tal(total?.PayableAmount),
    lines: linjeNoder.map((n) => lesLinje(n, erKreditnota)),
  };
}

function lesLinje(n: Record<string, unknown>, erKreditnota: boolean): EhfLinje {
  const mengdeNode = erKreditnota ? n.CreditedQuantity : n.InvoicedQuantity;
  const unitCode = attributt(mengdeNode, "unitCode");
  let quantity = tal(mengdeNode) ?? 0;
  const lineTotal = tal(n.LineExtensionAmount) ?? 0;

  const item = sti(n, "Item");
  const pris = sti(n, "Price");

  // Enhet. HMT er 100 meter: mengden ganges opp og prisen deles, så linja
  // står i meter som resten av appen.
  const kode = (unitCode ?? "").toUpperCase();
  const unit = UNIT[kode] ?? "stk";
  if (kode === "HMT") quantity = quantity * 100;

  let unitPrice: number;
  if (quantity > 0) {
    unitPrice = rund4(lineTotal / quantity);
  } else {
    // Ingen mengde: fall tilbake på oppgitt pris per BaseQuantity.
    const prisBeloep = tal(pris?.PriceAmount) ?? 0;
    const base = tal(pris?.BaseQuantity) ?? 1;
    unitPrice = rund4(prisBeloep / (base > 0 ? base : 1) / (kode === "HMT" ? 100 : 1));
  }

  const sellerItemId = tekst(sti(item, "SellersItemIdentification")?.ID);
  const name = tekst(item?.Name) ?? sellerItemId ?? "(uten navn)";
  const description = tekst(item?.Description);

  const orderLineRef = sti(n, "OrderLineReference");
  const orderReference = tekst(sti(orderLineRef, "OrderReference")?.ID);

  return {
    lineNo: tekst(n.ID),
    name,
    description,
    note: tekst(n.Note),
    sellerItemId,
    elnr: finnElnr(sellerItemId, name, description),
    gtin: tekst(sti(item, "StandardItemIdentification")?.ID),
    quantity: Math.round(quantity * 1000) / 1000,
    unit,
    unitCode,
    unitPrice,
    lineTotal: Math.round(lineTotal * 100) / 100,
    vatPct: tal(sti(item, "ClassifiedTaxCategory")?.Percent),
    orderReference,
  };
}

/**
 * Elnummeret er sju siffer. Hos elgrossistene står det som selgers varenummer;
 * ellers leter vi etter et sjusifret tall i navn og beskrivelse.
 */
export function finnElnr(
  sellerItemId: string | null,
  name: string | null,
  description: string | null,
): string | null {
  if (sellerItemId && /^\d{7}$/.test(sellerItemId.trim())) return sellerItemId.trim();
  for (const s of [sellerItemId, name, description]) {
    const m = /(?<!\d)\d{7}(?!\d)/.exec(s ?? "");
    if (m) return m[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Små hjelpere over det fast-xml-parser gir oss
// ---------------------------------------------------------------------------

type Node = Record<string, unknown>;

function sti(node: unknown, ...vegen: string[]): Node | undefined {
  let n: unknown = node;
  for (const steg of vegen) {
    if (!n || typeof n !== "object") return undefined;
    n = (n as Node)[steg];
    if (Array.isArray(n)) n = n[0];
  }
  return n && typeof n === "object" ? (n as Node) : undefined;
}

/** Tekstinnholdet i en node: enten en streng, eller {#text, @_attr}. */
function tekst(node: unknown): string | null {
  if (node === undefined || node === null) return null;
  if (Array.isArray(node)) return tekst(node[0]);
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && "#text" in (node as Node)) {
    return tekst((node as Node)["#text"]);
  }
  return null;
}

function attributt(node: unknown, navn: string): string | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const v = (node as Node)[`@_${navn}`];
  return typeof v === "string" ? v : null;
}

function tal(node: unknown): number | null {
  const t = tekst(node);
  if (t === null) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function adresse(a: Node | undefined): string | null {
  if (!a) return null;
  const linjer = ((a.AddressLine as Node[] | undefined) ?? [])
    .map((l) => tekst(l.Line))
    .filter(Boolean);
  const deler = [
    tekst(a.StreetName),
    tekst(a.AdditionalStreetName),
    ...linjer,
    [tekst(a.PostalZone), tekst(a.CityName)].filter(Boolean).join(" "),
  ].filter(Boolean);
  return deler.length ? deler.join(", ") : null;
}

function rund4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
