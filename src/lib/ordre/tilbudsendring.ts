/**
 * Endringer fra tilbudet, skrevet som et notat på ordren.
 *
 * Montøren ser tilbudet og sier hva som ble annerledes ute på jobben: flere
 * stikk, et punkt som utgikk, noe som kom i tillegg. Tilbudet på ordren er
 * frosset og røres ikke — endringene blir et notat, så kontoret ser dem når
 * jobben skal faktureres. Samme tekst lages i montørappen
 * (montor/lib/tilbudsendring.ts); hold dem like.
 */

export interface EndretLinje {
  description: string;
  unit: string;
  /** Antallet i tilbudet. */
  quantity: number;
  /** Antallet slik det ble. */
  ny: number;
}

const tall = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Notatteksten, eller null når ingenting er endret og kommentaren er tom. */
export function endringsNotat(linjer: EndretLinje[], kommentar: string): string | null {
  const endret = linjer.filter((l) => Number.isFinite(l.ny) && l.ny >= 0 && l.ny !== l.quantity);
  const k = kommentar.trim();
  if (endret.length === 0 && !k) return null;
  const rader = endret.map((l) => {
    const enhet = l.unit ? ` ${l.unit}` : "";
    return `– ${l.description}: ${tall(l.quantity)} → ${tall(l.ny)}${enhet}${l.ny === 0 ? " (utgår)" : ""}`;
  });
  return ["Endringer fra tilbudet:", ...rader, ...(k ? [rader.length ? `Kommentar: ${k}` : k] : [])].join("\n");
}
