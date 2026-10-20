"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KundeSok, type KundeForslag } from "@/components/KundeSok";
import { Modal } from "@/components/Modal";

/**
 * Ny ordre uten tilbud — en servicejobb som kom på telefon.
 *
 * Bare tittelen er påkrevd. Kundefeltene kan fylles inn nå eller på ordren
 * etterpå; det viktigste er at jobben får et nummer med en gang, så
 * montøren har noe å skrive på bestillingen.
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
    site_address: "",
  });
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
      site_address: f.site_address || (k.address ?? ""),
    }));
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!felt.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...felt, customer_id: kunde?.id }),
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
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Jobben</span>
              <input
                className="input"
                autoFocus
                required
                value={felt.title}
                onChange={(e) => sett("title", e.target.value)}
                placeholder="Bytte sikringsskap — Storgata 12"
              />
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Adresse</span>
              <input
                className="input"
                value={felt.site_address}
                onChange={(e) => sett("site_address", e.target.value)}
                placeholder="Der jobben gjøres — Storgata 12, Oslo"
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
          </div>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Oppretter…" : "Opprett ordre"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
