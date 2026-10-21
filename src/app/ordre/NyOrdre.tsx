"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KundeSok, type KundeForslag } from "@/components/KundeSok";
import { Modal } from "@/components/Modal";
import { TilbudSok, type TilbudForslag } from "@/components/TilbudSok";
import { AdresseFelt, type AdresseVerdier } from "@/app/register/kontakter/KontaktFelt";
import { adresseTekst, delAdresse } from "@/lib/kunder/adresse";

const TOM_ADRESSE: AdresseVerdier = { linje1: "", linje2: "", postnr: "", sted: "" };

/**
 * Ny ordre — fra et tilbud, eller en servicejobb som kom på telefon.
 *
 * Bare jobben er påkrevd. Kundefeltene kan fylles inn nå eller på ordren
 * etterpå; det viktigste er at jobben får et nummer med en gang, så
 * montøren har noe å skrive på bestillingen.
 *
 * Velges et tilbud, står tilbudsnummeret i feltet og resten fylles ut fra
 * tilbudet, men alt kan rettes. Ordren lages da som fra tilbudsutkastet —
 * med postene og prisen fra tilbudet — og med det som står i feltene.
 *
 * Jobben gjøres på kundens adresse, med mindre man krysser av for at den er
 * et annet sted — da overstyrer oppdragsadressen. Oppdragsadressen hører til
 * ordren; kunden i registeret beholder sin egen adresse.
 */
export function NyOrdre() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [felt, setFelt] = useState({
    title: "",
    customer_name: "",
    customer_contact: "",
    customer_email: "",
    customer_phone: "",
  });
  // Kundens adresse og oppdragsadressen, med de samme feltene som kontaktkortet.
  const [kundeAdresse, setKundeAdresse] = useState<AdresseVerdier>(TOM_ADRESSE);
  const [annenAdresse, setAnnenAdresse] = useState(false);
  const [oppdrag, setOppdrag] = useState<AdresseVerdier>(TOM_ADRESSE);
  // Tilbudet ordren lages fra, og teksten i tilbudsfeltet. Skrives feltet
  // om etter et valg, slippes tilbudet.
  const [tilbud, setTilbud] = useState<TilbudForslag | null>(null);
  const [tilbudTekst, setTilbudTekst] = useState("");
  // Kunden valgt fra registeret. Slippes når navnet skrives om.
  const [kunde, setKunde] = useState<KundeForslag | null>(null);

  function sett(navn: keyof typeof felt, verdi: string) {
    setFelt((f) => ({ ...f, [navn]: verdi }));
    if (navn === "customer_name" && kunde && verdi !== kunde.name) setKunde(null);
  }

  function velgKunde(k: KundeForslag) {
    setKunde(k);
    setFelt((f) => ({
      ...f,
      customer_name: k.name,
      customer_contact: k.contact ?? f.customer_contact,
      customer_email: k.email ?? f.customer_email,
      customer_phone: k.phone ?? f.customer_phone,
    }));
    if (k.adresse || k.address) setKundeAdresse(k.adresse ?? delAdresse(k.address));
  }

  /** Tilbudsnummeret i feltet, og resten fylt ut fra tilbudet. */
  function velgTilbud(t: TilbudForslag) {
    setTilbud(t);
    setTilbudTekst(String(t.quote_no));
    setKunde(null);
    setFelt({
      title: t.tittel,
      customer_name: t.kunde,
      customer_contact: t.felt.kontakt ?? "",
      customer_email: t.felt.epost ?? "",
      customer_phone: t.felt.telefon ?? "",
    });
    // Tilbudet har adressen på én linje; den deles opp i feltene.
    setKundeAdresse(delAdresse(t.felt.adresse));
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (tilbud?.ordre) {
      router.push(`/ordre/${tilbud.ordre.id}`);
      return;
    }
    if (!felt.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Jobben står på kundens adresse, med mindre oppdraget er et annet sted.
      const site_address = adresseTekst({ ...(annenAdresse ? oppdrag : kundeAdresse), land: "Norge" });
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...felt,
          customer_address: kundeAdresse.linje1,
          customer_address2: kundeAdresse.linje2,
          customer_postal_code: kundeAdresse.postnr,
          customer_city: kundeAdresse.sted,
          site_address,
          ...(tilbud ? { draft_id: tilbud.id } : { customer_id: kunde?.id }),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette ordren");
      router.push(`/ordre/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const rad = (etikett: string, navn: keyof typeof felt, ekstra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="kontakt-rad">
      <span className="kontakt-rad-etikett">{etikett}</span>
      <input className="input" value={felt[navn]} onChange={(e) => sett(navn, e.target.value)} {...ekstra} />
    </label>
  );

  return (
    <>
      <button className="button" onClick={() => setOpen(true)}>
        Ny ordre
      </button>

      <Modal open={open} onClose={close} title="Ny ordre">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          {/* Som i Go: etiketten foran feltet. Tilbudet øverst fyller ut
              resten; bare jobben er påkrevd. */}
          <div className="kontakt-panel ny-post-panel">
            <div className="kontakt-rad">
              <span className="kontakt-rad-etikett">Tilbud</span>
              <div>
                <TilbudSok
                  value={tilbudTekst}
                  onChange={(v) => {
                    setTilbudTekst(v);
                    if (tilbud && v !== String(tilbud.quote_no)) setTilbud(null);
                  }}
                  onVelg={velgTilbud}
                  placeholder="Valgfritt — tilbudsnummer eller kundenavn"
                />
                {tilbud &&
                  (tilbud.ordre ? (
                    <span className="hint">Det finnes alt en ordre fra dette tilbudet: #{tilbud.ordre.order_no}.</span>
                  ) : !tilbud.bekreftet ? (
                    <span className="hint krav">
                      Tilbudet er ikke bekreftet ennå.{" "}
                      <a href={`/tilbud/leads/${tilbud.lead_id}`} style={{ textDecoration: "underline" }}>
                        Åpne utkastet
                      </a>{" "}
                      og bekreft det først.
                    </span>
                  ) : (
                    <span className="hint">Fylt ut fra tilbudet. Postene og prisen følger med.</span>
                  ))}
              </div>
            </div>
            {rad("Jobben", "title", { required: true, autoFocus: true, placeholder: "Bytte sikringsskap — Storgata 12" })}

            <div className="kontakt-skilje">Kunden</div>
            <div className="kontakt-rad">
              <span className="kontakt-rad-etikett">Kunde</span>
              <div>
                <KundeSok
                  value={felt.customer_name}
                  onChange={(v) => sett("customer_name", v)}
                  onVelg={velgKunde}
                  placeholder="Søk eller skriv — Marit Aasen"
                />
                {kunde && <span className="hint">Fra kunderegisteret — resten er fylt ut.</span>}
              </div>
            </div>
            {rad("Kontaktperson", "customer_contact")}
            {rad("E-post", "customer_email", { type: "email" })}
            {rad("Telefon", "customer_phone")}
            <AdresseFelt verdier={kundeAdresse} onChange={setKundeAdresse} />

            {/* Som i Go: avkryssingen over feltene den styrer. Feltene står
                grå til man krysser av, så man ser hva valget betyr. */}
            <div className="kontakt-skilje">Oppdraget</div>
            <div className="kontakt-rad">
              <span />
              <label className="ny-post-lagre">
                <input
                  type="checkbox"
                  checked={annenAdresse}
                  onChange={(e) => setAnnenAdresse(e.target.checked)}
                />
                <span>
                  Oppdraget er på en annen adresse enn kundens
                  <span className="hint">Gjelder bare denne ordren. Kunden beholder sin adresse.</span>
                </span>
              </label>
            </div>
            <fieldset className="ny-post-prisfil" disabled={!annenAdresse}>
              <AdresseFelt verdier={oppdrag} onChange={setOppdrag} disabled={!annenAdresse} />
            </fieldset>
          </div>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Avbryt
            </button>
            <button
              className="button"
              type="submit"
              disabled={busy || (tilbud !== null && !tilbud.ordre && !tilbud.bekreftet)}
            >
              {busy
                ? "Oppretter…"
                : tilbud?.ordre
                  ? `Åpne ordre #${tilbud.ordre.order_no}`
                  : "Opprett ordre"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
