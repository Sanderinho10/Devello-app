"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KundeSok, type KundeForslag } from "@/components/KundeSok";
import { Modal } from "@/components/Modal";
import { TilbudSok, type TilbudForslag } from "@/components/TilbudSok";

/**
 * Ny ordre uten tilbud — en servicejobb som kom på telefon.
 *
 * Bare tittelen er påkrevd. Kundefeltene kan fylles inn nå eller på ordren
 * etterpå; det viktigste er at jobben får et nummer med en gang, så
 * montøren har noe å skrive på bestillingen.
 *
 * Velges et tilbud, lages ordren fra det — akkurat som «Opprett ordre» på
 * tilbudsutkastet: tittel, kunde, adresse og poster hentes fra tilbudet, og
 * feltene under er grået ut.
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
    customer_address: "",
    site_address: "",
  });
  const [annenAdresse, setAnnenAdresse] = useState(false);
  // Tilbudet ordren lages fra. Da sendes bare utkastet, som fra tilbudssiden.
  const [tilbud, setTilbud] = useState<TilbudForslag | null>(null);
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
      customer_address: k.address ?? f.customer_address,
    }));
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
    if (!tilbud && !felt.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tilbud ? { draft_id: tilbud.id } : {
          ...felt,
          // Jobben står på kundens adresse, med mindre oppdraget er et annet sted.
          site_address: annenAdresse ? felt.site_address : felt.customer_address,
          customer_id: kunde?.id,
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

  return (
    <>
      <button className="button" onClick={() => setOpen(true)}>
        Ny ordre
      </button>

      <Modal open={open} onClose={close} title="Ny ordre">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          {/* Som i Go: etiketten foran feltet, jobben øverst og kunden under.
              Bare jobben er påkrevd. */}
          <div className="kontakt-panel ny-post-panel">
            <div className="kontakt-rad">
              <span className="kontakt-rad-etikett">Tilbud</span>
              {tilbud ? (
                <div className="valgt-tilbud">
                  <div>
                    <strong>Tilbud {tilbud.quote_no}</strong> · {tilbud.tittel}
                    {tilbud.kunde && <div className="tiny muted">{tilbud.kunde}</div>}
                  </div>
                  <button type="button" className="button ghost" onClick={() => setTilbud(null)}>
                    Fjern
                  </button>
                </div>
              ) : (
                <TilbudSok onVelg={setTilbud} placeholder="Valgfritt — tilbudsnummer eller kundenavn" />
              )}
            </div>
            {tilbud && (
              <div className="kontakt-rad">
                <span />
                {tilbud.ordre ? (
                  <span className="hint" style={{ marginTop: -4 }}>
                    Det finnes alt en ordre fra dette tilbudet: #{tilbud.ordre.order_no}.
                  </span>
                ) : !tilbud.bekreftet ? (
                  <span className="hint krav" style={{ marginTop: -4 }}>
                    Tilbudet er ikke bekreftet ennå.{" "}
                    <a href={`/tilbud/leads/${tilbud.lead_id}`} style={{ textDecoration: "underline" }}>
                      Åpne utkastet
                    </a>{" "}
                    og bekreft det først.
                  </span>
                ) : (
                  <span className="hint" style={{ marginTop: -4 }}>
                    Ordren lages fra tilbudet, som fra tilbudsutkastet: jobb, kunde, adresse og poster hentes derfra.
                  </span>
                )}
              </div>
            )}

            <fieldset className="ny-post-prisfil" disabled={tilbud !== null}>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Jobben</span>
              <input
                className="input"
                autoFocus
                required={!tilbud}
                value={felt.title}
                onChange={(e) => sett("title", e.target.value)}
                placeholder="Bytte sikringsskap — Storgata 12"
              />
            </label>

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
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Kontaktperson</span>
              <input
                className="input"
                value={felt.customer_contact}
                onChange={(e) => sett("customer_contact", e.target.value)}
              />
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">E-post</span>
              <input
                className="input"
                type="email"
                value={felt.customer_email}
                onChange={(e) => sett("customer_email", e.target.value)}
              />
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Telefon</span>
              <input
                className="input"
                value={felt.customer_phone}
                onChange={(e) => sett("customer_phone", e.target.value)}
              />
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Adresse</span>
              <input
                className="input"
                value={felt.customer_address}
                onChange={(e) => sett("customer_address", e.target.value)}
                placeholder="Storgata 12, 0155 Oslo"
              />
            </label>

            {/* Som i Go: avkryssingen over feltet den styrer. Feltet står
                grått til man krysser av, så man ser hva valget betyr. */}
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
              <label className="kontakt-rad">
                <span className="kontakt-rad-etikett">Oppdragsadresse</span>
                <input
                  className="input"
                  value={felt.site_address}
                  onChange={(e) => sett("site_address", e.target.value)}
                  placeholder="Hytta — Fjellvegen 3, 3580 Geilo"
                  required={annenAdresse && !tilbud}
                />
              </label>
            </fieldset>
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
                  : tilbud
                    ? "Opprett ordre fra tilbudet"
                    : "Opprett ordre"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
