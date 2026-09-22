"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";

/**
 * Manuell henvendelse — for jobber som kom på telefon.
 *
 * Saksbehandleren skriver hva kunden spurte om, med sine egne ord, og agenten
 * behandler det som en hvilken som helst forespørsel. Ingen skjemafelt for
 * antall og poster: å plukke ut hva jobben består av er nettopp det agenten
 * skal gjøre.
 *
 * Kom henvendelsen på e-post til en innboks som ikke er koblet til, kan
 * e-posten dras rett inn i vinduet — eller på knappen. Da fylles tekst,
 * navn og adresse ut fra e-posten, og brukeren ser hva som ble hentet før
 * noe sendes til agenten. Se lib/leads/les-epostfil.
 */
export function ManualLead() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drar, setDrar] = useState(false);
  const [henta, setHenta] = useState<string | null>(null);
  const [leser, setLeser] = useState(false);
  const dybde = useRef(0);
  const filvelger = useRef<HTMLInputElement>(null);

  /**
   * Det som ble sluppet: en e-postfil, eller tekst markert og dratt inn.
   * Outlook på nett og Gmail gir ingen fil når man drar en e-post ut av
   * nettleseren — da er markert tekst det man har.
   */
  async function slipp(data: DataTransfer) {
    setError(null);
    setHenta(null);
    const filer = Array.from(data.files);
    if (filer.length > 0) {
      await lesFil(filer[0]);
      return;
    }
    const tekst = data.getData("text/plain").trim();
    if (tekst) {
      setDescription((d) => (d.trim() ? `${d.trimEnd()}\n\n${tekst}` : tekst));
      setHenta(null);
    }
  }

  async function lesFil(fil: File) {
    const { erEpostfil, lesEpostfil } = await import("@/lib/leads/les-epostfil");
    if (!erEpostfil(fil.name)) {
      setError(
        "Dra inn selve e-posten — en .msg-fil fra Outlook eller .eml fra Mail. " +
          `«${fil.name}» er ikke en e-post.`,
      );
      return;
    }
    setLeser(true);
    try {
      const lest = await lesEpostfil(fil.name, await fil.arrayBuffer());
      if (!lest.tekst) throw new Error("E-posten var tom.");
      // En ny e-post erstatter alt fra den forrige, også feltene den ikke
      // hadde noe til — ellers ble kunden fra forrige slipp stående igjen.
      setDescription(lest.tekst);
      setName(lest.navn ?? "");
      setEmail(lest.epost ?? "");
      setHenta(
        [
          `Hentet fra e-posten${lest.emne ? ` «${lest.emne}»` : ""}.`,
          lest.vedlegg.length > 0
            ? `${lest.vedlegg.length} vedlegg er ikke med — agenten leser bare teksten.`
            : null,
          "Se over før du lager utkast.",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å lese e-posten.");
    } finally {
      setLeser(false);
    }
  }

  const dragProps = {
    onDragEnter(e: React.DragEvent) {
      e.preventDefault();
      dybde.current += 1;
      setDrar(true);
    },
    onDragOver(e: React.DragEvent) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave() {
      dybde.current = Math.max(0, dybde.current - 1);
      if (dybde.current === 0) setDrar(false);
    },
    onDrop(e: React.DragEvent) {
      dybde.current = 0;
      setDrar(false);
      // Tekst dratt inn i et av feltene skal havne der den slippes — det gjør
      // nettleseren selv. Bare filer, og tekst sluppet utenfor feltene, er vårt.
      const iFelt = (e.target as HTMLElement).closest("textarea, input");
      if (iFelt && e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      void slipp(e.dataTransfer);
    },
  };

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
    setHenta(null);
  }

  // Popupen lukkes så snart henvendelsen er lagret — ikke når utkastet er
  // ferdig. Agenten bruker et minutt, og den tiden skal brukeren kunne bruke
  // på noe annet. Linjen dukker opp i listen med status «genererer», og
  // oppdaterer seg selv når utkastet er klart.

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!description.trim()) return;

    setError(null);
    try {
      setBusy(true);
      const created = await fetch("/api/leads/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          customer_name: name,
          customer_email: email,
        }),
      });
      const lead = await created.json();
      if (!created.ok) throw new Error(lead.error ?? "Kunne ikke lagre henvendelsen");

      setOpen(false);
      setDescription("");
      setName("");
      setEmail("");
      setHenta(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Knappen tar imot en e-post også: slipp den her, så åpnes vinduet
          med alt fylt ut. */}
      <button
        className={`button secondary${drar && !open ? " slipp-maal" : ""}`}
        onClick={() => setOpen(true)}
        {...dragProps}
        onDrop={(e) => {
          dragProps.onDrop(e);
          setOpen(true);
        }}
      >
        {drar && !open ? "Slipp e-posten her" : "Manuell henvendelse"}
      </button>

      <Modal open={open} onClose={close} size="wide" title="Manuell henvendelse">
        <form onSubmit={submit} className="epost-slipp" {...dragProps}>
          {drar && (
            <div className="epost-slipp-lag" aria-hidden>
              Slipp e-posten her
            </div>
          )}
          {error && <div className="banner error">{error}</div>}
          {henta && <div className="banner success">{henta}</div>}

          <div className="epost-slipp-hint tiny muted">
            {leser ? (
              "Leser e-posten…"
            ) : (
              <>
                Kom den på e-post? Dra e-posten inn her fra Outlook eller Mail,
                eller{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => filvelger.current?.click()}
                >
                  velg en e-postfil
                </button>
                .
              </>
            )}
            <input
              ref={filvelger}
              type="file"
              accept=".msg,.eml,message/rfc822,application/vnd.ms-outlook"
              hidden
              onChange={(e) => {
                const fil = e.target.files?.[0];
                if (fil) void lesFil(fil);
                e.target.value = "";
              }}
            />
          </div>

          <label className="field">
            <span className="label">Hva spurte kunden om?</span>
            <textarea
              className="textarea tall"
              autoFocus
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                "Skriv med egne ord, slik du ville forklart det til en kollega.\n\n" +
                "«Marit ringte. Skal pusse opp kjellerstua, ca. 24 m². Trenger 8 doble " +
                "stikkontakter, 4 takpunkt med bryter og en ny kurs fra sikringsskapet. " +
                "Veggene er åpne. Vil ha det gjort i september.»"
              }
            />
            <span className="hint">
              Agenten leser dette som en vanlig forespørsel og finner selv ut
              hvilke poster jobben består av.
            </span>
          </label>

          <div className="grid-2">
            <label className="field">
              <span className="label">Kunde (valgfritt)</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marit Aasen"
              />
            </label>
            <label className="field">
              <span className="label">E-post (valgfritt)</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="marit@example.no"
              />
            </label>
          </div>
          <span className="hint">
            E-posten blir mottaker på Outlook-kladden. Lar du den stå tom, fyller
            du den inn i Outlook før du sender.
          </span>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={close}
              disabled={busy}
            >
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Lagrer…" : "Lag utkast"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
