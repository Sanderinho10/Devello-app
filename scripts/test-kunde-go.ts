/**
 * Prøve på kunden vi foreslår å opprette i PowerOffice Go: uten kontakt skal
 * alt være som før, med kontakt skal firma/person, org.nr. og
 * fakturaadressen komme fra kontaktkortet. Uten database og uten Go.
 *
 *   npm run test:kunde-go
 */
import { foreslaaKunde, landkodeFor } from "@/lib/faktura/overfor";
import type { Customer } from "@/lib/types";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: unknown) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj !== undefined ? ` — ${JSON.stringify(detalj)}` : ""}`);
  if (!ok) feil += 1;
}

const ORDRE = {
  customer_name: "Bergen Eiendom AS",
  customer_contact: "Kari Hansen",
  customer_email: "kari@bergeneiendom.no",
  customer_phone: "55 12 34 56",
  site_address: "Hyttevegen 4, 5713 Vossestrand",
};

const KONTAKT: Customer = {
  id: "k1",
  company_id: "c1",
  name: "Bergen Eiendom AS",
  contact: "Kari Hansen",
  email: "post@bergeneiendom.no",
  phone: null,
  website: null,
  is_person: false,
  address: "Strandkaien 2",
  address2: null,
  postal_code: "5013",
  city: "Bergen",
  country: "Norge",
  invoice_separate: false,
  invoice_address: null,
  invoice_address2: null,
  invoice_postal_code: null,
  invoice_city: null,
  invoice_country: null,
  site_separate: false,
  site_address: null,
  site_address2: null,
  site_postal_code: null,
  site_city: null,
  org_nr: "912 345 678",
  notes: null,
  is_customer: true,
  is_supplier: false,
  created_at: "",
  updated_at: "",
};

// 1. Uten kontakt: nøyaktig som før.
const utan = foreslaaKunde(ORDRE);
sjekk("uten kontakt: bedrift fordi ordren har kontaktperson", utan.IsPerson === false);
sjekk("uten kontakt: ingen org.nr.", utan.OrganizationNumber === undefined);
sjekk(
  "uten kontakt: jobbadressen som postadresse",
  JSON.stringify(utan.MailAddress) ===
    JSON.stringify({ AddressLine1: "Hyttevegen 4", ZipCode: "5713", City: "Vossestrand", CountryCode: "NO" }),
  utan.MailAddress,
);
const privat = foreslaaKunde({ ...ORDRE, customer_name: "Ola Nordmann", customer_contact: null });
sjekk("uten kontakt: privatperson uten kontaktperson", privat.IsPerson && privat.FirstName === "Ola" && privat.LastName === "Nordmann");

// 2. Med kontakt, uten egen fakturaadresse: hovedadressen.
const med = foreslaaKunde(ORDRE, KONTAKT);
sjekk("med kontakt: org.nr. med bare sifre", med.OrganizationNumber === "912345678", med.OrganizationNumber);
sjekk("med kontakt: ordrens e-post vinner", med.EmailAddress === "kari@bergeneiendom.no");
sjekk(
  "med kontakt: hovedadressen, ikke jobbadressen",
  JSON.stringify(med.MailAddress) ===
    JSON.stringify({ AddressLine1: "Strandkaien 2", ZipCode: "5013", City: "Bergen", CountryCode: "NO" }),
  med.MailAddress,
);

// 3. Egen fakturaadresse.
const egen = foreslaaKunde(ORDRE, {
  ...KONTAKT,
  invoice_separate: true,
  invoice_address: "Postboks 100",
  invoice_address2: "Att. regnskap",
  invoice_postal_code: "5804",
  invoice_city: "Bergen",
  invoice_country: "Norge",
});
sjekk(
  "egen fakturaadresse brukes",
  JSON.stringify(egen.MailAddress) ===
    JSON.stringify({ AddressLine1: "Postboks 100", AddressLine2: "Att. regnskap", ZipCode: "5804", City: "Bergen", CountryCode: "NO" }),
  egen.MailAddress,
);

// 4. Person på kontaktkortet slår gjettingen, og får ikke org.nr.
const person = foreslaaKunde({ ...ORDRE, customer_name: "Kari Hansen" }, { ...KONTAKT, is_person: true });
sjekk("person fra kontaktkortet", person.IsPerson === true && person.LastName === "Hansen");
sjekk("person sender ikke org.nr.", person.OrganizationNumber === undefined);

// 5. Ugyldig org.nr. sendes ikke; e-post og telefon fylles fra kontakten når ordren mangler dem.
const tom = foreslaaKunde({ ...ORDRE, customer_email: null, customer_phone: null }, { ...KONTAKT, org_nr: "123", phone: "99 88 77 66" });
sjekk("ugyldig org.nr. sendes ikke", tom.OrganizationNumber === undefined);
sjekk("e-post fra kontakten", tom.EmailAddress === "post@bergeneiendom.no");
sjekk("telefon fra kontakten", tom.PhoneNumber === "99 88 77 66");

// 6. Kontakt uten adresse: faller tilbake til jobbadressen som før.
const utanAdr = foreslaaKunde(ORDRE, { ...KONTAKT, address: null, postal_code: null, city: null });
sjekk("kontakt uten adresse: jobbadressen", utanAdr.MailAddress?.AddressLine1 === "Hyttevegen 4");

// 7. Landkoder.
sjekk("Norge → NO", landkodeFor("Norge") === "NO");
sjekk("Sverige → SE", landkodeFor("Sverige") === "SE");
sjekk("tomt → NO", landkodeFor("") === "NO");
sjekk("ukjent → ingen kode", landkodeFor("Atlantis") === null);

console.log(feil ? `\n${feil} feil` : "\nAlt i orden");
process.exit(feil ? 1 : 0);
