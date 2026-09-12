/**
 * Motorversjonen som verdi — uten filsystem, så den kan brukes i klienten.
 *
 * Selve motoren (filene under agent/) lastes i motor.ts, som er server-kode.
 * Skjemaer og sider som bare trenger å vite HVILKE versjoner som finnes og hva
 * de heter, importerer herfra.
 */

export type MotorVersjon = "v2" | "v3";

export const MOTOR_VERSJONER: MotorVersjon[] = ["v2", "v3"];

export const MOTOR_LABELS: Record<MotorVersjon, string> = {
  v2: "v2 — dagens motor",
  v3: "v3 — omfang først, så pris",
};

export function erMotorVersjon(v: unknown): v is MotorVersjon {
  return v === "v2" || v === "v3";
}

/** Standarden når selskapet ikke har valgt selv. Leser miljøet — server. */
export function standardMotor(): MotorVersjon {
  return process.env.MOTOR_DEFAULT === "v3" ? "v3" : "v2";
}

/** Motoren et selskap skal kjøre: eget valg foran standard. */
export function motorFor(company: { motor_versjon?: string | null } | null | undefined): MotorVersjon {
  const valgt = company?.motor_versjon;
  return erMotorVersjon(valgt) ? valgt : standardMotor();
}

/**
 * Faget bestemmer hvilken bransjepakke (sjekklister, prisbånd) v3 leser.
 * Bare elektro finnes ennå, så alt annet faller tilbake på den — men kolonnen
 * finnes, så rørlegger og snekker er én mappe unna.
 */
export function fagFor(company: { fag?: string | null } | null | undefined): string {
  const fag = (company?.fag ?? "").trim().toLowerCase();
  return fag || "elektro";
}
