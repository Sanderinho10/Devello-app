import type { FakturaAdapter } from "./faktura-dokument";
import { parseEhf } from "./ehf";

/**
 * EHF / Peppol BIS Billing 3.0 som fil. Same parser som POGO-løypa brukar;
 * her berre kjenning av fila og innpakking i adapter-forma.
 */
export const ehfAdapter: FakturaAdapter = {
  key: "ehf",
  kjennerAtt(bytes) {
    const start = bytes.subarray(0, 600).toString("utf-8").replace(/^﻿/, "").trimStart();
    return /^<\?xml/i.test(start) || /^<(?:[a-z0-9]+:)?(Invoice|CreditNote)\b/i.test(start);
  },
  parse(bytes) {
    return [parseEhf(bytes.toString("utf-8").replace(/^﻿/, ""))];
  },
};
