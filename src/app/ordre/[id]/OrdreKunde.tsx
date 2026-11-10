"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { KundeSok, type KundeForslag } from "@/components/KundeSok";
import { adresseTekst, delAdresse, type Adresse } from "@/lib/kunder/adresse";
import type { Order } from "@/lib/types";

type Ordrefelt = Pick<
  Order,
  "customer_id" | "customer_name" | "customer_contact" | "customer_email" | "customer_phone" | "site_address"
>;

/** Det som står på kundekortet — forslagene i feltene. */
export interface Kundekort {
  id: string;
  name: string;
  customer_no: number | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  /** Hovedadressen, felt for felt. */
  adresse: Adresse;
}

type Tekst = "contact" | "email" | "phone";
type AdresseDel = "linje1" | "linje2" | "postnr" | "sted";
const ADRESSEDELAR: AdresseDel[] = ["linje1", "linje2", "postnr", "sted"];

interface Skjema {
  kundeId: string | null;
  kundeNavn: string;
  kort: Kundekort | null;
  /** Det brukeren har skrevet selv. Tomt: forslaget fra kundekortet gjelder. */
  tekst: Record<Tekst, string>;
  adresse: Record<AdresseDel, string>;
}

const lik = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * Skjemaet slik ordren står nå. Et felt som er likt kundekortet vises som
 * forslag (grått); et som er rettet for denne ordren står i svart.
 */
function fraOrdre(o: Ordrefelt, kort: Kundekort | null): Skjema {
  const egen = (verdi: string | null, forslag: string | null | undefined) =>
    kort && lik(verdi, forslag) ? "" : (verdi ?? "");
  const ordreAdresse = delAdresse(o.site_address);
  const kortAdresse = kort?.adresse;
  const sammeAdresse =
    kortAdresse && o.site_address && lik(adresseTekst({ ...ordreAdresse, land: "Norge" }), adresseTekst({ ...kortAdresse, land: "Norge" }));
  return {
    kundeId: o.customer_id,
    kundeNavn: o.customer_name,
    kort,
    tekst: {
      contact: egen(o.customer_contact, kort?.contact),
      email: egen(o.customer_email, kort?.email),
      phone: egen(o.customer_phone, kort?.phone),
    },
    adresse: sammeAdresse
      ? { linje1: "", linje2: "", postnr: "", sted: "" }
      : { linje1: ordreAdresse.linje1, linje2: ordreAdresse.linje2, postnr: ordreAdresse.postnr, sted: ordreAdresse.sted },
  };
}

/** Det som lagres: det brukeren skrev, ellers forslaget. */
function tilOrdre(s: Skjema) {
  const verdi = (navn: Tekst) => s.tekst[navn].trim() || (s.kort?.[navn] ?? "").trim() || null;
  // Adressen følger forslaget som helhet til man skriver i den — en halvt
  // utfylt adresse blandet med kortets ville bli en adresse som ikke finnes.
  const egenAdresse = ADRESSEDELAR.some((d) => s.adresse[d].trim());
  const adresse: Adresse = egenAdresse
    ? { ...s.adresse, land: "Norge" }
    : (s.kort?.adresse ?? { linje1: "", linje2: "", postnr: "", sted: "", land: "Norge" });
  return {
    customer_id: s.kundeId,
    customer_name: s.kundeNavn.trim(),
    customer_contact: verdi("contact"),
    customer_email: verdi("email"),
    customer_phone: verdi("phone"),
    site_address: adresseTekst({ ...adresse, land: "Norge" }) || null,
  };
}

/**
 * Kunden på ordren, som i PowerOffice Go.
 *
 * Kunden byttes med oppslag i kontaktregisteret. Kontaktperson, e-post,
 * telefon og jobbadresse foreslås fra kundekortet i grå skrift; skriver man
 * i et felt, gjelder det for denne ordren. Jobbadressen står som de andre
 * adressene: adresse, linje 2, postnummer og sted.
 */
export function OrdreKunde({
  orderId,
  kunde,
  kort,
}: {
  orderId: string;
  kunde: Ordrefelt;
  kort: Kundekort | null;
}) {
  const router = useRouter();
  const start = useMemo(() => fraOrdre(kunde, kort), [kunde, kort]);
  const [skjema, setSkjema] = useState<Skjema>(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endret = JSON.stringify(tilOrdre(skjema)) !== JSON.stringify(tilOrdre(start)) || skjema.kundeId !== start.kundeId;

  function velgKunde(k: KundeForslag) {
    // Ny kunde: alt fra kortet blir forslag. Det som var skrevet for den
    // forrige kunden, gjelder ikke lenger.
    setSkjema({
      kundeId: k.id,
      kundeNavn: k.name,
      kort: {
        id: k.id,
        name: k.name,
        customer_no: k.customer_no ?? null,
        contact: k.contact,
        email: k.email,
        phone: k.phone,
        adresse: { linje1: "", linje2: "", postnr: "", sted: "", land: "Norge", ...k.adresse },
      },
      tekst: { contact: "", email: "", phone: "" },
      adresse: { linje1: "", linje2: "", postnr: "", sted: "" },
    });
    setError(null);
  }

  async function lagre() {
    const data = tilOrdre(skjema);
    if (!data.customer_name) {
      setError("Ordren må ha en kunde.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const k = skjema.kort;
  const tekstfelt = (navn: Tekst, etikett: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="kontakt-rad">
      <span className="kontakt-rad-etikett">{etikett}</span>
      <input
        className="input forslag"
        value={skjema.tekst[navn]}
        placeholder={k?.[navn] ?? ""}
        onChange={(e) => setSkjema((s) => ({ ...s, tekst: { ...s.tekst, [navn]: e.target.value } }))}
        {...props}
      />
    </label>
  );
  const adressefelt = (del: AdresseDel, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      className="input forslag"
      value={skjema.adresse[del]}
      placeholder={k?.adresse[del] ?? ""}
      onChange={(e) => setSkjema((s) => ({ ...s, adresse: { ...s.adresse, [del]: e.target.value } }))}
      {...props}
    />
  );

  return (
    <div className="card card-pad ordre-kunde">
      <div className="row-between" style={{ marginBottom: 10, minHeight: 30 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Kunde
        </span>
        {skjema.kundeId && (
          <Link className="tiny lenke-bla" href={`/register/kontakter/${skjema.kundeId}`}>
            Åpne kundekortet →
          </Link>
        )}
      </div>
      {error && <div className="banner error">{error}</div>}

      <div className="kontakt-rad">
        <span className="kontakt-rad-etikett">Kundenr.</span>
        <span className="ordre-kunde-nr">{k?.customer_no ?? <span className="muted">—</span>}</span>
      </div>
      <div className="kontakt-rad">
        <span className="kontakt-rad-etikett">Kunde</span>
        <KundeSok
          value={skjema.kundeNavn}
          onChange={(t) =>
            // Skriver man et annet navn uten å velge, er det ikke lenger
            // kunden i registeret — den kobles på nytt ved lagring.
            setSkjema((s) => ({ ...s, kundeNavn: t, kundeId: t.trim() === s.kort?.name ? s.kundeId : null }))
          }
          onVelg={velgKunde}
          placeholder="Søk etter kunde"
        />
      </div>
      {tekstfelt("contact", "Kontaktperson")}
      {tekstfelt("email", "E-post", { type: "email" })}
      {tekstfelt("phone", "Telefon", { type: "tel" })}

      <div className="kontakt-skilje">Jobbadresse</div>
      <label className="kontakt-rad">
        <span className="kontakt-rad-etikett">Adresse</span>
        {adressefelt("linje1", { autoComplete: "address-line1" })}
      </label>
      <label className="kontakt-rad">
        <span className="kontakt-rad-etikett" />
        {adressefelt("linje2", { "aria-label": "Adresselinje 2", autoComplete: "address-line2" })}
      </label>
      <div className="kontakt-rad">
        <span className="kontakt-rad-etikett">Postnr./sted</span>
        <div className="kontakt-poststed">
          {adressefelt("postnr", { inputMode: "numeric", "aria-label": "Postnummer", autoComplete: "postal-code" })}
          {adressefelt("sted", { "aria-label": "Poststed", autoComplete: "address-level2" })}
        </div>
      </div>

      {endret && (
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="button ghost" onClick={() => setSkjema(start)} disabled={busy}>
            Angre
          </button>
          <button type="button" className="button" onClick={lagre} disabled={busy}>
            {busy ? "Lagrer…" : "Lagre"}
          </button>
        </div>
      )}
      {!skjema.kundeId && skjema.kundeNavn.trim() && (
        <p className="hint" style={{ marginTop: 8 }}>
          Kunden er ikke koblet til kunderegisteret. Velg fra listen, eller lagre — da kobles den på navn og e-post.
        </p>
      )}
    </div>
  );
}
