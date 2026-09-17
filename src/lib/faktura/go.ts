import type { InvoiceLine } from "./typar";
import type { ConnectionSettings, InvoiceDraft, Order, ProductMap, ProductMapKey } from "@/lib/types";

/**
 * Fra fakturaforslag til salgsordre i PowerOffice Go — ren, testbar.
 *
 * En salgsordre med status Draft er et fakturautkast i Go. Hver Normal-linje
 * må ha et produkt, fordi produktet bærer salgskonto og mva-kode der: derfor
 * produktmappingen per linjetype. Tekstlinjer går som LineType Text.
 * ExternalImportReference er utkastets id — det er idempotensnøkkelen: finnes
 * en ordre med den i Go fra før, lages ingen ny.
 */

export interface GoSalsordreLinje {
  LineType: "Normal" | "Text";
  ProductCode?: string;
  Description: string;
  Quantity?: number;
  ProductUnitPrice?: number;
  SortOrder: number;
}

export interface GoSalsordre {
  CustomerNo: number | string;
  SalesOrderStatus: "Draft";
  SalesOrderDate: string;
  CustomerReference?: string;
  PurchaseOrderReference: string;
  ProjectCode?: string;
  ExternalImportReference: string;
  SalesOrderLines: GoSalsordreLinje[];
}

/** Hvilket produkt i mappingen en linje går på. Tekst uten pris går som tekstlinje. */
export function produktNokkel(linje: Pick<InvoiceLine, "kind" | "unit_price">): ProductMapKey | null {
  if (linje.kind === "timer") return "arbeid";
  if (linje.kind === "materiell") return "materiell";
  if (linje.kind === "tilbod_seksjon" || linje.kind === "tilbod_linje") return "fastpris";
  if (linje.kind === "tekst" && linje.unit_price !== null) return "annet";
  return null;
}

/** Produktnøklene linjene som er med trenger — det som må være mappet før overføring. */
export function noedvendigeProdukt(lines: InvoiceLine[]): ProductMapKey[] {
  const ut = new Set<ProductMapKey>();
  for (const l of lines) {
    if (!l.included) continue;
    const k = produktNokkel(l);
    if (k) ut.add(k);
  }
  return [...ut];
}

export function manglandeProdukt(lines: InvoiceLine[], map: ProductMap): ProductMapKey[] {
  return noedvendigeProdukt(lines).filter((k) => !map[k]?.trim());
}

export function byggSalsordre(input: {
  draft: Pick<InvoiceDraft, "id" | "lines" | "invoice_text" | "customer_reference">;
  ordre: Pick<Order, "order_no">;
  customerNo: number | string;
  productMap: ProductMap;
  settings: ConnectionSettings;
  /** YYYY-MM-DD. Utelatt = i dag. */
  dato?: string;
}): GoSalsordre {
  const manglar = manglandeProdukt(input.draft.lines, input.productMap);
  if (manglar.length) {
    throw new Error(`Produktmappingen mangler for: ${manglar.join(", ")}. Sett den under Ordre → Innstillinger → Regnskapssystem.`);
  }

  const linjer: GoSalsordreLinje[] = [];
  let sort = 1;
  const tekst = input.draft.invoice_text?.trim();
  if (tekst) linjer.push({ LineType: "Text", Description: tekst, SortOrder: sort++ });

  for (const l of input.draft.lines) {
    if (!l.included) continue;
    const k = produktNokkel(l);
    if (!k) {
      linjer.push({ LineType: "Text", Description: l.description, SortOrder: sort++ });
      continue;
    }
    linjer.push({
      LineType: "Normal",
      ProductCode: input.productMap[k]!.trim(),
      Description: l.description,
      Quantity: Number(l.quantity),
      ProductUnitPrice: Number(l.unit_price),
      SortOrder: sort++,
    });
  }

  const ordre: GoSalsordre = {
    CustomerNo: input.customerNo,
    SalesOrderStatus: "Draft",
    SalesOrderDate: input.dato ?? new Date().toISOString().slice(0, 10),
    PurchaseOrderReference: `Ordre ${input.ordre.order_no}`,
    ExternalImportReference: input.draft.id,
    SalesOrderLines: linjer,
  };
  const ref = input.draft.customer_reference?.trim();
  if (ref) ordre.CustomerReference = ref;
  if (input.settings.project_per_order) ordre.ProjectCode = String(input.ordre.order_no);
  return ordre;
}
