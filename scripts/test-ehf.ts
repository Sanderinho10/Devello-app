/**
 * Prøve på EHF-parseren og ordrenummer-matchingen — uten database.
 *
 *   npm run test:ehf
 *
 * Fixturen er en minimal Peppol BIS Billing 3.0-faktura: to linjer, én med
 * linjenivå-ordrereferanse og selgers varenummer på sju siffer, én kabel i
 * HMT (100 meter) med linjerabatt. Pluss en kreditnota.
 */
import { finnElnr, parseEhf } from "@/lib/regnskap/ehf";
import { finnOrdrenummer } from "@/lib/regnskap/matching";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

const FAKTURA = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ID>48211</cbc:ID>
  <cbc:IssueDate>2026-09-12</cbc:IssueDate>
  <cbc:DueDate>2026-10-12</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:Note>Deres ref: D1042</cbc:Note>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>Ordre 1042 Kari Nordmann</cbc:BuyerReference>
  <cac:OrderReference><cbc:ID>1042</cbc:ID></cac:OrderReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>Onninen AS</cbc:Name></cac:PartyName>
    <cac:PartyLegalEntity><cbc:RegistrationName>ONNINEN AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">987654321</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>Star Elektro AS</cbc:Name></cac:PartyName>
    <cac:Contact><cbc:Name>Kari Nordmann</cbc:Name></cac:Contact>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:Delivery><cac:DeliveryLocation><cac:Address>
    <cbc:StreetName>Storgata 12</cbc:StreetName><cbc:CityName>Bergen</cbc:CityName><cbc:PostalZone>5003</cbc:PostalZone>
  </cac:Address></cac:DeliveryLocation></cac:Delivery>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">7950.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">7950.00</cbc:TaxExclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">9937.50</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">250.00</cbc:LineExtensionAmount>
    <cac:OrderLineReference><cbc:LineID>1</cbc:LineID><cac:OrderReference><cbc:ID>1042</cbc:ID></cac:OrderReference></cac:OrderLineReference>
    <cac:Item>
      <cbc:Description>Innfelt, hvit</cbc:Description>
      <cbc:Name>Stikkontakt dobbel</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>1234567</cbc:ID></cac:SellersItemIdentification>
      <cac:StandardItemIdentification><cbc:ID schemeID="0160">7020160123456</cbc:ID></cac:StandardItemIdentification>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">25.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:InvoiceLine>
    <cbc:ID>2</cbc:ID>
    <cbc:InvoicedQuantity unitCode="HMT">2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">7700.00</cbc:LineExtensionAmount>
    <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="NOK">300.00</cbc:Amount></cac:AllowanceCharge>
    <cac:Item>
      <cbc:Name>Kabel PFXP 3G2,5 elnr 1001234</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>ONN-KAB-25</cbc:ID></cac:SellersItemIdentification>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">4000.00</cbc:PriceAmount><cbc:BaseQuantity unitCode="HMT">1</cbc:BaseQuantity></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const KREDITNOTA = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>K-9</cbc:ID>
  <cbc:IssueDate>2026-09-13</cbc:IssueDate>
  <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Onninen AS</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:CreditNoteLine>
    <cbc:ID>1</cbc:ID>
    <cbc:CreditedQuantity unitCode="C62">2</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">50.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Stikkontakt dobbel</cbc:Name></cac:Item>
  </cac:CreditNoteLine>
</CreditNote>`;

// Faktura ------------------------------------------------------------------
const f = parseEhf(FAKTURA);
sjekk("type faktura, nummer, datoer, valuta", f.type === "faktura" && f.invoiceNo === "48211" && f.issueDate === "2026-09-12" && f.dueDate === "2026-10-12" && f.currency === "NOK");
sjekk("OrderReference/ID = 1042", f.orderReference === "1042", f.orderReference ?? "null");
sjekk("BuyerReference og Note", f.buyerReference === "Ordre 1042 Kari Nordmann" && f.note === "Deres ref: D1042");
sjekk("leverandør: RegistrationName foran PartyName, org.nr", f.supplierName === "ONNINEN AS" && f.supplierOrgNr === "987654321", `${f.supplierName} / ${f.supplierOrgNr}`);
sjekk("kontaktnavn hos kjøper", f.customerContactName === "Kari Nordmann");
sjekk("leveringsadresse", f.deliveryAddress === "Storgata 12, 5003 Bergen", f.deliveryAddress ?? "null");
sjekk("totaler", f.taxExclusiveAmount === 7950 && f.payableAmount === 9937.5);
sjekk("to linjer", f.lines.length === 2, `${f.lines.length}`);

const l1 = f.lines[0];
sjekk("linje 1: 10 stk (C62), sum 250, pris 25", l1.quantity === 10 && l1.unit === "stk" && l1.lineTotal === 250 && l1.unitPrice === 25);
sjekk("linje 1: elnr fra SellersItemIdentification", l1.elnr === "1234567" && l1.sellerItemId === "1234567");
sjekk("linje 1: GTIN, mva, navn, beskrivelse", l1.gtin === "7020160123456" && l1.vatPct === 25 && l1.name === "Stikkontakt dobbel" && l1.description === "Innfelt, hvit");
sjekk("linje 1: linjenivå-ordreref", l1.orderReference === "1042", l1.orderReference ?? "null");

const l2 = f.lines[1];
sjekk("linje 2: HMT → 200 m", l2.quantity === 200 && l2.unit === "m" && l2.unitCode === "HMT", `${l2.quantity} ${l2.unit}`);
sjekk("linje 2: pris per meter = 7700 / 200 (etter rabatt, ikke PriceAmount)", l2.unitPrice === 38.5, `${l2.unitPrice}`);
sjekk("linje 2: elnr funnet i navnet, ikke i selgers varenr", l2.elnr === "1001234" && l2.sellerItemId === "ONN-KAB-25");
sjekk("linje 2: ingen linjenivå-ordreref", l2.orderReference === null);

// Kreditnota ---------------------------------------------------------------
const k = parseEhf(KREDITNOTA);
sjekk("kreditnota: type og CreditedQuantity", k.type === "kreditnota" && k.invoiceNo === "K-9" && k.lines[0].quantity === 2 && k.lines[0].unitPrice === 25);

// finnElnr -----------------------------------------------------------------
sjekk("finnElnr: ikke åtte siffer", finnElnr("12345678", "Kabel 12345678", null) === null);
sjekk("finnElnr: null når ingenting", finnElnr("ABC", "Skrue", "4 mm") === null);

// Matching -----------------------------------------------------------------
const gyldige = new Set([1000, 1001, 1042, 1043]);
sjekk("match: «1042»", finnOrdrenummer(["1042"], gyldige) === 1042);
sjekk("match: «Ordre 1042 Kari Nordmann»", finnOrdrenummer(["Ordre 1042 Kari Nordmann"], gyldige) === 1042);
sjekk("match: «D1042»", finnOrdrenummer(["D1042"], gyldige) === 1042);
sjekk("match: tvetydig «1042/1043» → null", finnOrdrenummer(["1042/1043"], gyldige) === null);
sjekk("match: ukjent «9999» → null", finnOrdrenummer(["9999"], gyldige) === null);
sjekk("match: elnummer (7 siffer) treffer ikke", finnOrdrenummer(["1001042"], gyldige) === null);
sjekk("match: første kandidat med treff avgjør", finnOrdrenummer([null, "9999", "Ref 1001", "1042"], gyldige) === 1001);
sjekk("match: tvetydig kandidat stopper, senere kandidat brukes ikke", finnOrdrenummer(["1042/1043", "1000"], gyldige) === null);

console.log(feil === 0 ? "\nAlt i orden." : `\n${feil} feil.`);
process.exit(feil === 0 ? 0 : 1);
