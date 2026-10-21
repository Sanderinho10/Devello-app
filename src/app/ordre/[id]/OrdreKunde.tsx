"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Order } from "@/lib/types";

type Kundefelt = Pick<
  Order,
  "customer_id" | "customer_name" | "customer_contact" | "customer_email" | "customer_phone" | "site_address"
>;

/**
 * Kunden på ordren.
 *
 * Kundeopplysningene vises bare her — skal de endres, gjøres det på
 * kundekortet, som lenken går til. Jobbadressen er ordrens egen (hvor akkurat
 * denne jobben gjøres), så den kan rettes her.
 */
export function OrdreKunde({ orderId, kunde }: { orderId: string; kunde: Kundefelt }) {
  const router = useRouter();
  const [adresse, setAdresse] = useState(kunde.site_address ?? "");
  const [lagret, setLagret] = useState(kunde.site_address ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endret = adresse.trim() !== lagret.trim();

  async function lagre() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_address: adresse }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setLagret(adresse);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const tom = <span className="muted">—</span>;

  return (
    <div className="card card-pad ordre-kunde">
      <div className="row-between" style={{ marginBottom: 10, minHeight: 30 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Kunde
        </span>
        {kunde.customer_id && (
          <Link className="tiny lenke-bla" href={`/register/kontakter/${kunde.customer_id}`}>
            Åpne kundekortet →
          </Link>
        )}
      </div>
      {error && <div className="banner error">{error}</div>}

      <dl className="ordre-kunde-info">
        <dt>Kunde</dt>
        <dd>
          {kunde.customer_name ? (
            kunde.customer_id ? (
              <Link className="lenke-bla" href={`/register/kontakter/${kunde.customer_id}`}>
                {kunde.customer_name}
              </Link>
            ) : (
              kunde.customer_name
            )
          ) : (
            tom
          )}
        </dd>
        <dt>Kontaktperson</dt>
        <dd>{kunde.customer_contact || tom}</dd>
        <dt>E-post</dt>
        <dd>
          {kunde.customer_email ? <a href={`mailto:${kunde.customer_email}`}>{kunde.customer_email}</a> : tom}
        </dd>
        <dt>Telefon</dt>
        <dd>{kunde.customer_phone ? <a href={`tel:${kunde.customer_phone.replace(/\s/g, "")}`}>{kunde.customer_phone}</a> : tom}</dd>
      </dl>

      {/* Jobbadressen hører til ordren, ikke kunden, og kan rettes her. */}
      <label className="kontakt-rad" style={{ marginTop: 10, marginBottom: 0 }}>
        <span className="kontakt-rad-etikett">Jobbadresse</span>
        <input
          className="input"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="Hvor jobben gjøres"
        />
      </label>
      {endret && (
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="button ghost" onClick={() => setAdresse(lagret)} disabled={busy}>
            Angre
          </button>
          <button type="button" className="button" onClick={lagre} disabled={busy}>
            {busy ? "Lagrer…" : "Lagre"}
          </button>
        </div>
      )}
      {!kunde.customer_id && kunde.customer_name && (
        <p className="hint" style={{ marginTop: 8 }}>
          Kunden er ikke koblet til kunderegisteret.
        </p>
      )}
    </div>
  );
}
