"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  kanBliVedlegg,
  MAKS_FILSTORRELSE,
  MAKS_OPPLASTING,
  MAKS_VEDLEGG,
} from "@/lib/leads/vedlegg-grenser";

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
 * navn og adresse ut fra e-posten, og bildene og PDF-ene i den blir med til
 * agenten. Bilder og PDF-er kan også dras inn for seg, for eksempel et bilde
 * kunden sendte på SMS. Brukeren ser hva som ble hentet før noe sendes.
 */
export function ManualLead() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [vedlegg, setVedlegg] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drar, setDrar] = useState(false);
  const [henta, setHenta] = useState<string | null>(null);
  const [leser, setLeser] = useState(false);
  const dybde = useRef(0);
  const filvelger = useRef<HTMLInputElement>(null);

  /**
   * Det som ble sluppet: e-postfiler, bilder og PDF-er, eller tekst markert
   * og dratt inn. Outlook på nett og Gmail gir ingen fil når man drar en
   * e-post ut av nettleseren — da er markert tekst det man har.
   */
  async function slipp(data: DataTransfer) {
    setError(null);
    setHenta(null);
    const filer = Array.from(data.files);
    if (filer.length > 0) {
      await lesFiler(filer);
      return;
    }
    const tekst = data.getData("text/plain").trim();
    if (tekst) {
      setDescription((d) => (d.trim() ? `${d.trimEnd()}\n\n${tekst}` : tekst));
    }
  }

  async function lesFiler(filer: File[]) {
    const { erEpostfil, lesEpostfil } = await import("@/lib/leads/les-epostfil");
    const eposter = filer.filter((f) => erEpostfil(f.name));
    const andre = filer.filter((f) => !erEpostfil(f.name));
    const feil: string[] = [];

    setLeser(true);
    try {
      // Én e-post er én henvendelse. Slippes flere, er det den første som
      // gjelder — å slå sammen to kunder i ett tilbud er aldri det man vil.
      let fraEpost: File[] = [];
      if (eposter.length > 0) {
        const fil = eposter[0];
        const lest = await lesEpostfil(fil.name, await fil.arrayBuffer());
        if (!lest.tekst) throw new Error("E-posten var tom.");
        // En ny e-post erstatter alt fra den forrige, også feltene den ikke
        // hadde noe til — ellers ble kunden fra forrige slipp stående igjen.
        setDescription(lest.tekst);
        setName(lest.navn ?? "");
        setEmail(lest.epost ?? "");
        fraEpost = lest.filer;
        setHenta(
          `Hentet fra e-posten${lest.emne ? ` «${lest.emne}»` : ""}` +
            (lest.filer.length > 0
              ? `, med ${lest.filer.length} vedlegg agenten ser på.`
              : ".") +
            " Se over før du lager utkast.",
        );
        if (eposter.length > 1) feil.push("Bare den første e-posten ble lest — én e-post er én henvendelse.");
      }

      for (const f of andre) {
        if (!kanBliVedlegg(f.name, f.type)) {
          feil.push(`«${f.name}» er ikke en e-post, et bilde eller en PDF.`);
        }
      }

      const nye = await Promise.all(
        [...fraEpost, ...andre.filter((f) => kanBliVedlegg(f.name, f.type))].map(krympBilde),
      );
      leggTilVedlegg(
        nye.filter((f): f is File => f !== null),
        eposter.length > 0,
        feil,
      );
    } catch (err) {
      feil.push(err instanceof Error ? err.message : "Klarte ikke å lese e-posten.");
    } finally {
      setLeser(false);
      if (feil.length > 0) setError(feil.join(" "));
    }
  }

  /**
   * Legger til innenfor taket. En ny e-post erstatter vedleggene fra den
   * forrige; bilder og PDF-er dratt inn for seg kommer i tillegg.
   */
  function leggTilVedlegg(nye: File[], erstatt: boolean, feil: string[]) {
    const fra = erstatt ? [] : vedlegg;
    const finnes = new Set(fra.map((f) => `${f.name}:${f.size}`));
    const ut = [...fra];
    let total = ut.reduce((s, f) => s + f.size, 0);
    for (const f of nye) {
      if (finnes.has(`${f.name}:${f.size}`)) continue;
      if (f.size > MAKS_FILSTORRELSE) {
        feil.push(`«${f.name}» er større enn ${MAKS_FILSTORRELSE / 1024 / 1024} MB.`);
        continue;
      }
      if (ut.length >= MAKS_VEDLEGG) {
        feil.push(`Maks ${MAKS_VEDLEGG} vedlegg — «${f.name}» ble ikke med.`);
        continue;
      }
      if (total + f.size > MAKS_OPPLASTING) {
        feil.push(`«${f.name}» ble ikke med — vedleggene blir til sammen for store.`);
        continue;
      }
      ut.push(f);
      finnes.add(`${f.name}:${f.size}`);
      total += f.size;
    }
    setVedlegg(ut);
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

  function nullstill() {
    setDescription("");
    setName("");
    setEmail("");
    setVedlegg([]);
    setHenta(null);
  }

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
      let created: Response;
      if (vedlegg.length > 0) {
        const data = new FormData();
        data.set("description", description);
        data.set("customer_name", name);
        data.set("customer_email", email);
        for (const f of vedlegg) data.append("vedlegg", f);
        created = await fetch("/api/leads/manual", { method: "POST", body: data });
      } else {
        created = await fetch("/api/leads/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            customer_name: name,
            customer_email: email,
          }),
        });
      }
      const lead = await created.json();
      if (!created.ok) throw new Error(lead.error ?? "Kunne ikke lagre henvendelsen");

      setOpen(false);
      nullstill();
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
              Slipp e-posten, bildene eller PDF-ene her
            </div>
          )}
          {error && <div className="banner error">{error}</div>}
          {henta && <div className="banner success">{henta}</div>}

          <div className="epost-slipp-hint tiny muted">
            {leser ? (
              "Leser filene…"
            ) : (
              <>
                Kom den på e-post? Dra e-posten inn her fra Outlook eller Mail,
                og bilder eller PDF-er kunden har sendt. Du kan også{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => filvelger.current?.click()}
                >
                  velge filer
                </button>
                .
              </>
            )}
            <input
              ref={filvelger}
              type="file"
              multiple
              accept=".msg,.eml,message/rfc822,application/vnd.ms-outlook,.pdf,application/pdf,.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const filer = Array.from(e.target.files ?? []);
                if (filer.length > 0) {
                  setError(null);
                  setHenta(null);
                  void lesFiler(filer);
                }
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

          {vedlegg.length > 0 && (
            <div className="field">
              <span className="label">
                Vedlegg · {vedlegg.length} av {MAKS_VEDLEGG}
              </span>
              <div className="stack" style={{ gap: 6 }}>
                {vedlegg.map((f) => (
                  <div key={`${f.name}:${f.size}`} className="file-row">
                    <span className="drop-icon">{erPdf(f) ? "▤" : "▣"}</span>
                    <span className="file-row-name">
                      <strong>{f.name}</strong>
                      <span className="tiny muted">
                        {" "}
                        · {erPdf(f) ? "PDF" : "bilde"} · {storleik(f.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="button ghost"
                      disabled={busy}
                      onClick={() => setVedlegg((v) => v.filter((x) => x !== f))}
                    >
                      Fjern
                    </button>
                  </div>
                ))}
              </div>
              <span className="hint">
                Agenten ser på bildene og leser PDF-ene sammen med teksten —
                antall punkter, mål og det eksisterende anlegget kommer ofte
                tydeligere fram der.
              </span>
            </div>
          )}

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
            <button className="button" type="submit" disabled={busy || leser}>
              {busy
                ? vedlegg.length > 0
                  ? "Laster opp vedlegg…"
                  : "Lagrer…"
                : "Lag utkast"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function erPdf(f: File): boolean {
  return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
}

function storleik(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/**
 * Skalerer ned bilder før de lastes opp. Et mobilbilde er 3–12 MB; serveren
 * skalerer uansett til det modellen leser, og det er ingen grunn til å sende
 * ti slike over en mobillinje først. Små bilder (logoer, ikoner) tas ikke med.
 * Går noe galt — et format nettleseren ikke kan tegne — sendes fila som den er,
 * og serveren avgjør.
 */
async function krympBilde(f: File): Promise<File | null> {
  if (erPdf(f)) return f;
  try {
    const bilde = await createImageBitmap(f);
    const { width, height } = bilde;
    if (width < 200 && height < 200) {
      bilde.close();
      return null;
    }
    const skala = Math.min(1, 2000 / Math.max(width, height));
    if (skala === 1 && f.size < 1.5 * 1024 * 1024) {
      bilde.close();
      return f;
    }
    const lerret = document.createElement("canvas");
    lerret.width = Math.round(width * skala);
    lerret.height = Math.round(height * skala);
    const ctx = lerret.getContext("2d");
    if (!ctx) return f;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lerret.width, lerret.height);
    ctx.drawImage(bilde, 0, 0, lerret.width, lerret.height);
    bilde.close();
    const blob = await new Promise<Blob | null>((ok) => lerret.toBlob(ok, "image/jpeg", 0.85));
    if (!blob) return f;
    return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}
