"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KundeSok, type KundeForslag } from "@/components/KundeSok";
import { Modal } from "@/components/Modal";
import { OrdreSok, type OrdreValg } from "@/components/OrdreSok";
import { AdresseFelt, type AdresseVerdier } from "@/app/register/kontakter/KontaktFelt";
import { NyKontaktDialog } from "@/app/register/kontakter/NyKontakt";
import { adresseTekst, delAdresse } from "@/lib/kunder/adresse";

const TOM_ADRESSE: AdresseVerdier = { linje1: "", linje2: "", postnr: "", sted: "" };

/**
 * Ny faktura — fra en ordre, eller rett her.
 *
 * Samme mønster som «Ny ordre»: feltet øverst velger hvor fakturaen kommer
 * fra. Velges en ordre, går man til fakturaen på ordren — der lager agenten
 * forslaget av tilbudet, timene og materiellet. Uten ordre lages en tom
 * faktura til kunden, og linjene skrives inn i fakturaen etterpå.
 */
export function NyFaktura() {
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
  const [adresse, setAdresse] = useState<AdresseVerdier>(TOM_ADRESSE);
  // Ordren fakturaen lages fra, og teksten i ordrefeltet. Skrives feltet
  // om etter et valg, slippes ordren.
  const [ordre, setOrdre] = useState<OrdreValg | null>(null);
  const [ordreTekst, setOrdreTekst] = useState("");
  // Kunden valgt fra registeret. Slippes når navnet skrives om.
  const [kunde, setKunde] = useState<KundeForslag | null>(null);
  const [nyKunde, setNyKunde] = useState<{ navn: string } | null>(null);

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
    if (k.adresse || k.address) setAdresse(k.adresse ?? delAdresse(k.address));
  }

  function velgOrdre(o: OrdreValg) {
    setOrdre(o);
    setOrdreTekst(`#${o.order_no} · ${o.title}`);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (ordre) {
      router.push(`/ordre/${ordre.id}/faktura`);
      return;
    }
    if (!felt.customer_name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fakturaer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...felt,
          customer_address: adresseTekst({ ...adresse, land: "Norge" }),
          customer_id: kunde?.id,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette fakturaen");
      router.push(`/fakturaer/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const rad = (etikett: string, navn: keyof typeof felt, ekstra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="kontakt-rad">
      <span className="kontakt-rad-etikett">{etikett}</span>
      <input
        className="input"
        value={felt[navn]}
        onChange={(e) => sett(navn, e.target.value)}
        disabled={ordre !== null}
        {...ekstra}
      />
    </label>
  );

  return (
    <>
      <button className="button" onClick={() => setOpen(true)}>
        Ny faktura
      </button>

      <Modal open={open} onClose={close} title="Ny faktura">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          <div className="kontakt-panel ny-post-panel">
            <div className="kontakt-rad">
              <span className="kontakt-rad-etikett">Ordre</span>
              <div>
                <OrdreSok
                  value={ordreTekst}
                  status="alle"
                  onChange={(v) => {
                    setOrdreTekst(v);
                    if (ordre) setOrdre(null);
                  }}
                  onVelg={velgOrdre}
                  placeholder="Valgfritt — ordrenummer, tittel eller kunde"
                />
                {ordre ? (
                  <span className="hint">
                    Fakturaen lages på ordren. Agenten foreslår linjene fra tilbudet, timene og materiellet.
                  </span>
                ) : (
                  <span className="hint">Uten ordre lages en tom faktura til kunden under, og du skriver linjene selv.</span>
                )}
              </div>
            </div>

            <fieldset className="ny-post-prisfil" disabled={ordre !== null}>
              {rad("Tittel", "title", { placeholder: "Valgfritt — til eget bruk, vises i listen" })}

              <div className="kontakt-skilje">Kunden</div>
              <div className="kontakt-rad">
                <span className="kontakt-rad-etikett">Kunde</span>
                <div>
                  <KundeSok
                    value={felt.customer_name}
                    onChange={(v) => sett("customer_name", v)}
                    onVelg={velgKunde}
                    onNyKunde={(navn) => setNyKunde({ navn })}
                    placeholder="Søk eller skriv — Marit Aasen"
                  />
                  {kunde && <span className="hint">Fra kunderegisteret — resten er fylt ut.</span>}
                </div>
              </div>
              {rad("Kontaktperson", "customer_contact")}
              {rad("E-post", "customer_email", { type: "email" })}
              {rad("Telefon", "customer_phone")}
              <AdresseFelt verdier={adresse} onChange={setAdresse} disabled={ordre !== null} />
            </fieldset>
          </div>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy || (!ordre && !felt.customer_name.trim())}>
              {busy ? "Oppretter…" : ordre ? `Gå til fakturaen på ordre #${ordre.order_no}` : "Opprett faktura"}
            </button>
          </div>
        </form>

        <NyKontaktDialog
          open={nyKunde !== null}
          onClose={() => setNyKunde(null)}
          startNavn={nyKunde?.navn ?? ""}
          tittel="Ny kunde"
          knapp="Opprett kunde"
          onOpprettet={velgKunde}
        />
      </Modal>
    </>
  );
}
