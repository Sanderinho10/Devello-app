import Link from "next/link";
import { notFound } from "next/navigation";
import { OrdreFaner } from "./OrdreFaner";
import { OrdreStatus } from "./OrdreStatus";
import { hentOrdre } from "@/lib/ordre/hent";
import { formatDate } from "@/lib/types";

/**
 * Ordren som faner med egne ruter.
 *
 * Headeren og fanene er felles for Oversikt, Timer og Materiell, så de bor
 * i layouten. Hver fane er en egen adresse — montøren skal kunne legge
 * /ordre/<id>/timer som bokmerke på mobilen og lande rett i skjemaet.
 * Ordren hentes med hentOrdre(), som React cacher per forespørsel: fanen
 * under spør ikke databasen en gang til.
 */
export default async function OrdreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ordre = await hentOrdre(id);
  if (!ordre) notFound();

  return (
    <>
      <div className="page-header">
        <div>
          <Link className="button ghost" href="/ordre" style={{ marginLeft: -10 }}>
            ← Ordrer
          </Link>
          <h1 style={{ marginTop: 6 }}>
            <span className="muted">Ordre #{ordre.order_no}</span> · {ordre.title}
          </h1>
          <p className="page-subtitle">
            Opprettet {formatDate(ordre.created_at)}
            {ordre.lead_id && (
              <>
                {" · "}
                <Link href={`/tilbud/leads/${ordre.lead_id}`} style={{ textDecoration: "underline" }}>
                  Fra tilbud →
                </Link>
              </>
            )}
          </p>
        </div>
        <OrdreStatus orderId={ordre.id} status={ordre.status} />
      </div>

      <OrdreFaner orderId={ordre.id} />

      {children}
    </>
  );
}
