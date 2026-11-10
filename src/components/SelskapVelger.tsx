"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Bytt selskap uten å logge ut, som i Go: selskapsnavnet øverst i menyen er
 * en knapp, og lista under viser selskapene brukeren er med i. Etter byttet
 * går man til dashboardet — siden man sto på, hører til det andre selskapet.
 *
 * Selskapet man står i, er lagret på brukeren, ikke i nettleseren: bytter
 * man på PC-en, står man i det samme selskapet i montørappen også.
 */
export function SelskapVelger({
  selskaper,
  aktivId,
}: {
  selskaper: { id: string; name: string }[];
  aktivId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feil, setFeil] = useState<string | null>(null);
  const rot = useRef<HTMLDivElement>(null);
  const aktiv = selskaper.find((s) => s.id === aktivId);

  useEffect(() => {
    if (!open) return;
    const lukk = (e: MouseEvent) => {
      if (!rot.current?.contains(e.target as Node)) setOpen(false);
    };
    const tast = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", lukk);
    document.addEventListener("keydown", tast);
    return () => {
      document.removeEventListener("mousedown", lukk);
      document.removeEventListener("keydown", tast);
    };
  }, [open]);

  async function bytt(id: string) {
    if (id === aktivId) {
      setOpen(false);
      return;
    }
    setBusy(id);
    setFeil(null);
    try {
      const res = await fetch("/api/selskap/bytt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke bytte selskap");
      // Full innlasting, ikke klientnavigering: alt på skjermen hørte til det
      // andre selskapet, og ingenting av det skal ligge igjen i en cache.
      window.location.assign("/dashboard");
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="selskap-velger" ref={rot}>
      <button
        type="button"
        className="selskap-velger-knapp"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="selskap-velger-etikett">Selskap</span>
        <span className="selskap-velger-navn">{aktiv?.name ?? "Velg selskap"}</span>
        <span className="selskap-velger-pil" aria-hidden>
          ⌄
        </span>
      </button>
      {open && (
        <div className="selskap-velger-liste" role="listbox" aria-label="Bytt selskap">
          {selskaper.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={s.id === aktivId}
              className={`selskap-velger-valg${s.id === aktivId ? " aktiv" : ""}`}
              onClick={() => bytt(s.id)}
              disabled={busy !== null}
            >
              <span>{s.name}</span>
              {s.id === aktivId ? <span aria-hidden>✓</span> : busy === s.id ? <span className="tiny muted">Bytter…</span> : null}
            </button>
          ))}
        </div>
      )}
      {feil && <div className="tiny" style={{ color: "var(--danger, #b3261e)", marginTop: 6 }}>{feil}</div>}
    </div>
  );
}
