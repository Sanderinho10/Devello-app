"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";
const ENDELSER = /\.(png|jpe?g|webp|svg)$/i;

/**
 * Logoen som fil, ikke som lenke.
 *
 * Egen komponent og eget endepunkt, utenfor resten av innstillingsskjemaet:
 * en fil kan ikke ligge og vente på at noen trykker «Lagre» sammen med
 * tekstfeltene. Den lastes opp med én gang og vises som den blir seende ut.
 */
export function LogoUpload({ harLogo }: { harLogo: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Endres etter opplasting, så nettleseren henter det nye bildet i stedet
  // for å vise det gamle fra cachen.
  const [versjon, setVersjon] = useState(0);

  async function lastOpp(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ENDELSER.test(file.name)) {
      setError("Logoen må være PNG, JPG, WEBP eller SVG.");
      return;
    }

    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await fetch("/api/brand/logo", { method: "POST", body: data });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke laste opp logoen");
      setVersjon((v) => v + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function fjern() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/brand/logo", { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span className="label">Logo</span>

      {harLogo ? (
        <div className="file-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/brand/logo?v=${versjon}`}
            alt="Logoen deres"
            style={{ height: 38, maxWidth: 150, objectFit: "contain" }}
          />
          <span className="file-row-name tiny muted">
            Slik står den øverst i tilbudet.
          </span>
          <button
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Bytt
          </button>
          <button type="button" className="button ghost" disabled={busy} onClick={fjern}>
            Fjern
          </button>
        </div>
      ) : (
        <div
          className={`drop${over ? " over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            lastOpp(event.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Velg eller dra inn logoen"
        >
          <span className="drop-icon">▦</span>
          <span>
            {busy ? (
              "Laster opp…"
            ) : (
              <>
                Dra inn logoen, eller <span className="drop-link">velg en fil</span>
              </>
            )}
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => lastOpp(event.target.files?.[0])}
      />

      <span className="hint">
        PNG, JPG, WEBP eller SVG, opptil 2 MB. Står best med gjennomsiktig
        bakgrunn. Uten logo bruker tilbudet firmanavnet i tekst.
      </span>

      {error && (
        <div className="banner error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
