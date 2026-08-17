"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.svg,image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

/**
 * Et bilde som hører til merkevaren: logoen, eller bildet i e-postsignaturen.
 *
 * Tre veier inn, fordi folk gjør det ulikt: dra fila hit, lime inn med
 * Ctrl+V, eller velge den fra maskinen. Innliming er den viktigste av dem —
 * en signaturlogo ligger som regel allerede i Outlook-signaturen, og da er
 * kopier-lim den korteste veien. Utklippstavlen gir oss en fil som heter
 * «image.png» eller ingenting, så typen leses av innholdet og ikke av navnet.
 *
 * Bildet lastes opp med én gang. En fil kan ikke ligge og vente på at noen
 * trykker «Lagre» sammen med tekstfeltene rundt.
 */
export function BrandImageUpload({
  type,
  label,
  hint,
  harBilde,
  hoyde = 38,
  kanEndre = true,
}: {
  /** «logo» eller «signatur» — styrer hvilken kolonne den havner i. */
  type: "logo" | "signatur";
  label: string;
  hint: React.ReactNode;
  harBilde: boolean;
  /** Visningshøyde i forhåndsvisningen. */
  hoyde?: number;
  kanEndre?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const laast = busy || !kanEndre;
  const [error, setError] = useState<string | null>(null);
  // Endres etter opplasting, så nettleseren henter det nye bildet i stedet
  // for å vise det gamle fra cachen.
  const [versjon, setVersjon] = useState(0);

  async function lastOpp(file: File | undefined | null) {
    if (!file || laast) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Dette er ikke et bilde. PNG, JPG, WEBP, GIF eller SVG.");
      return;
    }

    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await fetch(`/api/brand/${type}`, { method: "POST", body: data });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke laste opp bildet");
      setVersjon((v) => v + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /** Bildet i utklippstavlen, om det er et der. */
  function fraUtklipp(event: React.ClipboardEvent) {
    const bilde = Array.from(event.clipboardData.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (!bilde) return;
    event.preventDefault();
    lastOpp(bilde);
  }

  async function fjern() {
    setBusy(true);
    setError(null);
    try {
      await fetch(`/api/brand/${type}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span className="label">{label}</span>

      {harBilde ? (
        <div className="file-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/brand/${type}?v=${versjon}`}
            alt=""
            style={{ height: hoyde, maxWidth: 220, objectFit: "contain" }}
          />
          <span className="file-row-name" />
          <button
            type="button"
            className="button ghost"
            disabled={laast}
            onClick={() => inputRef.current?.click()}
          >
            Bytt
          </button>
          <button type="button" className="button ghost" disabled={laast} onClick={fjern}>
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
          onPaste={fraUtklipp}
          onClick={() => !laast && inputRef.current?.click()}
          onKeyDown={(event) => {
            if (!laast && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`${label}: dra inn, lim inn eller velg fil`}
        >
          <span className="drop-icon">▦</span>
          <span>
            {busy ? (
              "Laster opp…"
            ) : (
              <>
                Dra inn bildet, lim inn med Ctrl+V, eller{" "}
                <span className="drop-link">velg en fil</span>
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

      <span className="hint">{hint}</span>

      {error && (
        <div className="banner error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
