"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Panel, Rad } from "./Panel";
import type { SignaturValg } from "@/lib/dokumentasjon/signatur";

/**
 * Lagrede signaturer.
 *
 * Samsvarserklæringen er det eneste skjemaet som signeres: montøren skriver
 * navnet sitt, og den som godkjenner velger en av signaturene her. En
 * signatur tegnes på skjermen (finger eller mus) eller lastes opp som
 * bilde, og knyttes til brukeren som skal kunne signere med den.
 * Administrator kan velge alle.
 */
export function Signaturer({
  signaturer,
  kolleger,
  erAdmin,
}: {
  signaturer: SignaturValg[];
  kolleger: { id: string; navn: string }[];
  erAdmin: boolean;
}) {
  const router = useRouter();
  const flate = useRef<HTMLCanvasElement>(null);
  const tegner = useRef(false);
  const [tegnet, setTegnet] = useState(false);
  const [fil, setFil] = useState<File | null>(null);
  const [navn, setNavn] = useState("");
  const [tittel, setTittel] = useState("");
  const [bruker, setBruker] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lerretet i skjermens oppløsning, så streken blir skarp i PDF-en.
  useEffect(() => {
    const c = flate.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function punkt(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function ned(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = flate.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    tegner.current = true;
    const p = punkt(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // Et prikk-trykk skal også synes.
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
    setTegnet(true);
    setFil(null);
  }

  function flytt(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!tegner.current) return;
    const ctx = flate.current?.getContext("2d");
    if (!ctx) return;
    const p = punkt(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function tom() {
    const c = flate.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.restore();
    }
    setTegnet(false);
  }

  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    setBusy("lagre");
    setError(null);
    try {
      let bilde: Blob | null = fil;
      if (!bilde && tegnet && flate.current) {
        bilde = await new Promise<Blob | null>((ferdig) => flate.current!.toBlob(ferdig, "image/png"));
      }
      if (!bilde) throw new Error("Tegn signaturen i feltet, eller last opp et bilde.");
      const form = new FormData();
      form.append("name", navn);
      form.append("title", tittel);
      form.append("user_id", bruker);
      form.append("file", bilde, fil?.name ?? "signatur.png");
      const res = await fetch("/api/signaturer", { method: "POST", body: form });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre signaturen");
      setNavn("");
      setTittel("");
      setBruker("");
      setFil(null);
      tom();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function slett(s: SignaturValg) {
    if (!window.confirm(`Slette signaturen til ${s.name}? Dokumenter som alt er signert med den, står som de er.`)) return;
    setBusy(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/signaturer/${s.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const brukerNavn = (id: string | null) => kolleger.find((k) => k.id === id)?.navn ?? null;

  return (
    <>
      {error && <div className="banner error">{error}</div>}
      <Panel
        tittel="Signaturer"
        hint="Samsvarserklæringen godkjennes med en av disse. De andre skjemaene trenger ingen signatur."
        flat
      >
        {signaturer.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen signaturer ennå</div>
            <div>{erAdmin ? "Legg inn signaturen til den som godkjenner samsvarserklæringene." : "En administrator legger dem inn."}</div>
          </div>
        ) : (
          signaturer.map((s) => (
            <div key={s.id} className="signatur-rad">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/signaturer/${s.id}/bilde`} alt={`Signaturen til ${s.name}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{s.name}</strong>
                {s.title && <span className="muted"> · {s.title}</span>}
                <div className="tiny muted">
                  {brukerNavn(s.user_id) ? `Tilhører ${brukerNavn(s.user_id)} — kan signere selv` : "Ikke knyttet til en bruker — bare administrator kan velge den"}
                </div>
              </div>
              {erAdmin && (
                <button type="button" className="button ghost" disabled={busy !== null} onClick={() => slett(s)}>
                  {busy === s.id ? "Sletter…" : "Slett"}
                </button>
              )}
            </div>
          ))
        )}
      </Panel>

      {erAdmin && (
        <form onSubmit={lagre}>
          <Panel tittel="Ny signatur" hint="Tegn med fingeren på mobil eller nettbrett, eller med musa. Du kan også laste opp et bilde av signaturen.">
            <Rad etikett="Navn" hint="Står under signaturen på erklæringen.">
              <input className="input" value={navn} onChange={(e) => setNavn(e.target.value)} required maxLength={120} placeholder="Roger Hansen" />
            </Rad>
            <Rad etikett="Tittel" hint="Valgfritt.">
              <input className="input" value={tittel} onChange={(e) => setTittel(e.target.value)} maxLength={120} placeholder="Faglig ansvarlig" />
            </Rad>
            <Rad etikett="Tilhører" hint="Brukeren som skal kunne signere med den. Administrator kan velge alle signaturer.">
              <select className="input" value={bruker} onChange={(e) => setBruker(e.target.value)}>
                <option value="">Ingen bestemt bruker</option>
                {kolleger.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.navn}
                  </option>
                ))}
              </select>
            </Rad>
            <Rad etikett="Signatur" topp som="div">
              <canvas
                ref={flate}
                className="signatur-flate"
                aria-label="Tegn signaturen her"
                onPointerDown={ned}
                onPointerMove={flytt}
                onPointerUp={() => (tegner.current = false)}
                onPointerCancel={() => (tegner.current = false)}
              />
              <span className="row" style={{ flexWrap: "wrap", marginTop: 8 }}>
                <button type="button" className="button secondary" onClick={tom} disabled={!tegnet}>
                  Tøm
                </button>
                <label className="button secondary" style={{ cursor: "pointer" }}>
                  Last opp bilde
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFil(f);
                      if (f) tom();
                      e.target.value = "";
                    }}
                  />
                </label>
                {fil && (
                  <span className="tiny muted">
                    {fil.name}{" "}
                    <button type="button" className="linkish" onClick={() => setFil(null)}>
                      fjern
                    </button>
                  </span>
                )}
              </span>
            </Rad>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="button" type="submit" disabled={busy !== null || !navn.trim() || (!tegnet && !fil)}>
                {busy === "lagre" ? "Lagrer…" : "Lagre signatur"}
              </button>
            </div>
          </Panel>
        </form>
      )}
    </>
  );
}
