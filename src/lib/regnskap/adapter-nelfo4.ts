import type { FakturaAdapter } from "./faktura-dokument";

/**
 * EFO/NELFO Fakturaformat 4.0 — IKKJE SKRIVEN ENNO.
 *
 * Adapteren blir skriven når spesifikasjonen ligg i
 * docs/efo-nelfo-faktura-4.0.md og minst éi ekte fil ligg i prover/.
 * Layouten skal lesast frå spesifikasjon + fil, aldri gjettast: feil
 * skalering på beløp gjev feil kostpris på kvar einaste ordre.
 *
 * Til då: fila blir kjend att (postkode-layout — to store bokstavar og
 * semikolon, ikkje XML), og parse kastar tydeleg. Fila står som «feil» med
 * denne meldinga, ikkje som stille ingenting.
 */
export const IKKJE_STOETTA =
  "Formatet er ikke støttet ennå: EFO/NELFO 4.0 faktura. Legg spesifikasjon i docs/ og prøvefil i prover/.";

export const nelfo4Adapter: FakturaAdapter = {
  key: "nelfo4",
  kjennerAtt(bytes) {
    const start = bytes.subarray(0, 200).toString("latin1").replace(/^﻿/, "").trimStart();
    if (/^</.test(start)) return false;
    return /^[A-Z]{2};/.test(start);
  },
  parse() {
    throw new Error(IKKJE_STOETTA);
  },
};
