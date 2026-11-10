/**
 * Felles lesing av skjemaet for en abonnementsfaktura. Returnerer feltene
 * som skal skrives, eller en feilmelding.
 */
export function lesFakturaFelt(
  body: Record<string, unknown>,
  kreverAlle: boolean,
): { felt: Record<string, unknown> } | { feil: string } {
  const felt: Record<string, unknown> = {};

  if (body.fakturanr !== undefined || kreverAlle) {
    const nr = typeof body.fakturanr === "string" ? body.fakturanr.trim().slice(0, 40) : "";
    if (!nr) return { feil: "Fakturaen må ha et nummer." };
    felt.fakturanr = nr;
  }
  if (body.belop_nok !== undefined || kreverAlle) {
    const belop = Number(String(body.belop_nok ?? "").replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(belop) || belop <= 0) return { feil: "Beløpet må være et tall over 0." };
    felt.belop_nok = Math.round(belop * 100) / 100;
  }
  if (body.forfall !== undefined || kreverAlle) {
    const forfall = typeof body.forfall === "string" ? body.forfall.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(forfall) || Number.isNaN(Date.parse(forfall))) {
      return { feil: "Forfallsdatoen er ugyldig." };
    }
    felt.forfall = forfall;
  }
  return { felt };
}
