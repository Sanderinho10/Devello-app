import type { Kjelder, MaterialSource, TimeSource } from "./typar";
import type { Order } from "@/lib/types";

/**
 * Konteksten modellen får: ordren, tilbudet, timene, materiellet — kompakt,
 * med id-ene planen skal peke på.
 *
 * Prisene er med så modellen forstår størrelsene (14 timer på en jobb
 * tilbudt til 8 000 kr er noe annet enn på en til 80 000). Men skjemaet
 * den svarer i har ingen tallfelt, så det er ingen vei fra prisene her til
 * en linje på fakturaen som ikke går gjennom koden.
 */
export function byggKontekst(
  ordre: Pick<Order, "order_no" | "title" | "description" | "customer_name" | "customer_contact" | "quote_type">,
  kjelder: Kjelder,
  maalform: "nb" | "nn",
): string {
  const deler: string[] = [];

  deler.push(
    [
      "# Ordren",
      "",
      `Ordrenummer: ${ordre.order_no}`,
      `Tittel: ${ordre.title}`,
      `Kunde: ${ordre.customer_name || "(ukjent)"}${ordre.customer_contact ? ` (kontakt: ${ordre.customer_contact})` : ""}`,
      `Kundetype: ${ordre.customer_contact ? "bedrift" : "ukjent"}`,
      `Målform for all kundevendt tekst: ${maalform === "nn" ? "nynorsk" : "bokmål"}`,
      "",
      ordre.description ? `Arbeidsbeskrivelse:\n${ordre.description}` : "Ingen arbeidsbeskrivelse.",
    ].join("\n"),
  );

  if (kjelder.sections.length === 0) {
    deler.push(
      `# Tilbudet\n\n${
        ordre.quote_type === "tid_og_materiell"
          ? "Tilbudet var tid og materiell: timesatser og materiell etter forbruk. Ingen fastpris."
          : "Ordren har ikke noe tilbud. Faktureres etter tid og materiell."
      }`,
    );
  } else {
    const linjer: string[] = [
      "# Tilbudet kunden sa ja til",
      "",
      `Tilbudstype: ${kjelder.quote_type}`,
      "Alle priser eks. mva. Rabatt i prosent av linjesummen.",
      "",
    ];
    for (const s of kjelder.sections) {
      linjer.push(`## Seksjon ${s.id}: ${s.title}`);
      for (const l of s.lines) {
        linjer.push(
          `- ${l.id}: ${l.description} — ${tal(l.quantity)} ${l.unit} × ${tal(l.unit_price)} kr${
            l.discount_pct > 0 ? ` (rabatt ${tal(l.discount_pct)} %)` : ""
          }`,
        );
      }
      linjer.push("");
    }
    if (kjelder.assumptions?.length) {
      linjer.push("Forutsetninger i tilbudet (det som kommer i tillegg om jobben krever mer):");
      for (const a of kjelder.assumptions) linjer.push(`- ${a}`);
    }
    deler.push(linjer.join("\n"));
  }

  deler.push(timeBlokk(kjelder.timar));
  deler.push(materiellBlokk(kjelder.materiell));

  return deler.join("\n\n");
}

function timeBlokk(timar: TimeSource[]): string {
  if (timar.length === 0) return "# Timer\n\nIngen timer ført.";
  const linjer = ["# Timer", "", "id · dato · montør · timetype · timer × sats · notat · status", ""];
  for (const t of timar) {
    const status = t.invoiced ? "ALT FAKTURERT" : t.billable ? "fakturerbar" : "IKKE fakturerbar";
    linjer.push(
      `- ${t.id} · ${t.work_date} · ${t.user_name} · ${t.time_type_name} · ${tal(t.hours)} t × ${tal(t.unit_price)} kr${
        t.note ? ` · «${t.note}»` : ""
      } · ${status}`,
    );
  }
  return linjer.join("\n");
}

function materiellBlokk(materiell: MaterialSource[]): string {
  if (materiell.length === 0) return "# Materiell\n\nIngen materiell ført.";
  const linjer = [
    "# Materiell",
    "",
    "id · kilde · elnr · navn · mengde × salgspris (kost) · notat · status",
    "",
  ];
  for (const m of materiell) {
    const status = m.invoiced
      ? "ALT FAKTURERT"
      : m.replaced
        ? "ERSTATTET av leverandørfaktura"
        : m.billable
          ? "fakturerbar"
          : "IKKE fakturerbar";
    const kilde = m.source === "faktura" ? `leverandørfaktura${m.invoice_no ? ` ${m.invoice_no}` : ""}` : m.source;
    linjer.push(
      `- ${m.id} · ${kilde} · ${m.item_no ?? "—"} · ${m.name} · ${tal(m.quantity)} ${m.unit} × ${tal(m.sale_price)} kr${
        m.cost_price !== null ? ` (kost ${tal(m.cost_price)})` : " (uten kostpris)"
      }${m.note ? ` · «${m.note}»` : ""} · ${status}`,
    );
  }
  return linjer.join("\n");
}

function tal(n: number): string {
  return Number(n).toLocaleString("nb-NO", { maximumFractionDigits: 2 });
}
