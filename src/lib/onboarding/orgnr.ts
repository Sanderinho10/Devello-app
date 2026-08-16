/**
 * Norske organisasjonsnummer.
 *
 * Ni siffer, der det siste er en MOD11-kontrollsiffer. Å regne den ut koster
 * ingenting og fanger tastefeil før de blir en konto med feil orgnr — som er
 * dyrt å rette opp når fakturaen først er sendt.
 */

const WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Sifrene alene. «912 345 678» og «912345678» er samme nummer.
 *
 * Brukes både i feltene (så det ikke går an å taste annet enn sifre) og i
 * API-rutene (som aldri skal stole på at klienten gjorde det). Lagret form er
 * alltid ni sifre uten skilletegn — det er den duplikatsjekken sammenligner.
 */
export function normalizeOrgNr(value: string): string {
  return value.replace(/\D/g, "");
}

export interface OrgNrCheck {
  ok: boolean;
  error?: string;
}

export function validateOrgNr(value: string): OrgNrCheck {
  const digits = normalizeOrgNr(value);

  if (digits.length === 0) return { ok: false, error: "Organisasjonsnummer mangler." };
  if (digits.length !== 9) {
    return { ok: false, error: "Et organisasjonsnummer har ni siffer." };
  }

  const sum = WEIGHTS.reduce(
    (total, weight, index) => total + weight * Number(digits[index]),
    0,
  );
  const remainder = sum % 11;
  const control = remainder === 0 ? 0 : 11 - remainder;

  // Rest 1 gir kontrollsiffer 10, som ikke får plass i ett siffer. Da finnes
  // nummeret rett og slett ikke.
  if (control === 10 || control !== Number(digits[8])) {
    return { ok: false, error: "Dette er ikke et gyldig organisasjonsnummer." };
  }

  return { ok: true };
}
