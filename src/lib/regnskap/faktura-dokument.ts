import { ehfAdapter } from "./adapter-ehf";
import { nelfo4Adapter } from "./adapter-nelfo4";

/**
 * Éi leverandørfaktura slik alle kjelder leverer henne.
 *
 * EHF-parseren leverte alt dette frå før (EhfFaktura). Typane bur her, og
 * ehf.ts eksporterer dei same namna som alias — så POGO-løypa og
 * FTP-løypa les nøyaktig same struktur, og matching/materiell bryr seg
 * ikkje om kvar fakturaen kom frå.
 */

export type FakturaEnhet = "stk" | "m" | "kg" | "l";

export interface FakturaLinje {
  lineNo: string | null;
  name: string;
  description: string | null;
  note: string | null;
  /** Seljarens varenummer, slik det står. */
  sellerItemId: string | null;
  /** Elnummer: sju siffer frå sellerItemId, elles frå namn/skildring. */
  elnr: string | null;
  gtin: string | null;
  quantity: number;
  unit: FakturaEnhet;
  /** Eininga slik fakturaen sa det, for feilsøking. */
  unitCode: string | null;
  /** Netto per eining eks. mva = lineTotal / quantity. */
  unitPrice: number;
  /** Linjesum eks. mva etter linjerabatt. */
  lineTotal: number;
  vatPct: number | null;
  /** Linjenivå-ordrereferanse (samlefaktura), elles null. */
  orderReference: string | null;
}

export interface FakturaDokument {
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
  /** «Deres ref» hamnar ofte her. */
  customerContactName: string | null;
  deliveryAddress: string | null;
  taxExclusiveAmount: number | null;
  payableAmount: number | null;
  lines: FakturaLinje[];
}

export type FakturaFormat = "ehf" | "nelfo4";

export interface FakturaAdapter {
  key: FakturaFormat;
  /** Kjenner adapteren att fila? Billeg sjekk på innhald, ikkje filnamn. */
  kjennerAtt(bytes: Buffer, fileName: string): boolean;
  /** Ei fil kan innehalde fleire fakturaer (NELFO-bunt). EHF: alltid éi. */
  parse(bytes: Buffer): FakturaDokument[];
}

export const ADAPTERAR: FakturaAdapter[] = [ehfAdapter, nelfo4Adapter];

export function finnAdapter(bytes: Buffer, fileName: string): FakturaAdapter | null {
  return ADAPTERAR.find((a) => a.kjennerAtt(bytes, fileName)) ?? null;
}

/** Referansane grossisten skreiv, i prioritert rekkjefølgje. Same logikk for alle kjelder. */
export function referansarFraDokument(dok: FakturaDokument | null, fraFoer: string[] = []): string[] {
  const ut = new Set<string>(fraFoer ?? []);
  for (const r of [
    dok?.orderReference,
    dok?.buyerReference,
    dok?.customerContactName,
    dok?.note,
    ...(dok?.lines.map((l) => l.orderReference) ?? []),
  ]) {
    if (r && r.trim()) ut.add(r.trim().slice(0, 120));
  }
  return [...ut];
}

/** Dei fyrste teikna i fila som tekst, til feilmeldingar. Aldri heile innhaldet. */
export function foersteLinje(bytes: Buffer, maks = 80): string {
  const tekst = bytes.subarray(0, 400).toString("latin1").replace(/^﻿/, "");
  return tekst.split(/\r\n|\n|\r/)[0].trim().slice(0, maks);
}
