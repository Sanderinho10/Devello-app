"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DokumentData, Felt, Feltverdi, Mal, Seksjon } from "@/lib/dokumentasjon/malar/typar";
import { manglandePaakravde } from "@/lib/dokumentasjon/motor";
import { formatDate, type OrderDocument } from "@/lib/types";

/**
 * Skjemaet montøren fyller ut på jobb.
 *
 * Én kolonne, seksjoner som kort, kontrollpunkt som tre store knapper,
 * måleverdier med kravet rett under. Endringer lagres av seg selv etter et
 * sekund («Lagret 14:32»); nederst står hva som mangler før «Fullfør og
 * signer» kan trykkes. Ferdig = låst visning med PDF; administrator kan
 * gjenåpne.
 */
export function SkjemaSide({
  orderId,
  dok,
  mal,
  manglar: manglarStart,
  erAdmin,
}: {
  orderId: string;
  dok: OrderDocument;
  mal: Mal;
  manglar: string[];
  erAdmin: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<DokumentData>(dok.data as DokumentData);
  const [lagra, setLagra] = useState<string | null>(null);
  const [lagrar, setLagrar] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manglarServer, setManglarServer] = useState<string[] | null>(null);
  const laast = dok.status === "ferdig";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const siste = useRef<string>(JSON.stringify(dok.data));

  const manglar = manglarServer ?? manglandePaakravde(mal, data);

  const lagre = useCallback(
    async (d: DokumentData) => {
      const json = JSON.stringify(d);
      if (json === siste.current) return;
      setLagrar(true);
      try {
        const res = await fetch(`/api/orders/${orderId}/dokumenter/${dok.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: d }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
        siste.current = json;
        setLagra(new Date().toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLagrar(false);
      }
    },
    [orderId, dok.id],
  );

  // Autolagring: ett sekund etter siste tastetrykk.
  useEffect(() => {
    if (laast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void lagre(data), 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, laast, lagre]);

  function sett(key: string, v: Feltverdi) {
    setManglarServer(null);
    setData((d) => ({ ...d, [key]: v }));
  }

  function settRad(seksjon: string, i: number, key: string, v: Feltverdi) {
    setManglarServer(null);
    setData((d) => {
      const rader = Array.isArray(d[seksjon]) ? [...(d[seksjon] as Record<string, Feltverdi>[])] : [];
      rader[i] = { ...rader[i], [key]: v };
      return { ...d, [seksjon]: rader };
    });
  }

  function leggTilRad(s: Seksjon) {
    setData((d) => {
      const rader = Array.isArray(d[s.key]) ? [...(d[s.key] as Record<string, Feltverdi>[])] : [];
      const ny: Record<string, Feltverdi> = {};
      for (const f of s.fields) ny[f.key] = f.type === "checkbox" ? false : "";
      return { ...d, [s.key]: [...rader, ny] };
    });
  }

  function fjernRad(seksjon: string, i: number) {
    setData((d) => {
      const rader = Array.isArray(d[seksjon]) ? [...(d[seksjon] as Record<string, Feltverdi>[])] : [];
      rader.splice(i, 1);
      return { ...d, [seksjon]: rader };
    });
  }

  async function fullfor() {
    if (timer.current) clearTimeout(timer.current);
    await lagre(data);
    if (!window.confirm(`Fullføre og signere «${mal.title}»? Skjemaet låses og PDF-en lages med ditt navn og tidspunkt.`)) return;
    setBusy("fullfor");
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/dokumenter/${dok.id}/fullfor`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) {
        if (Array.isArray(payload.manglar)) setManglarServer(payload.manglar);
        throw new Error(payload.error ?? "Kunne ikke fullføre");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function gjenopne() {
    if (!window.confirm("Gjenåpne skjemaet? PDF-en slettes, og dokumentet må sendes til Boligmappa på nytt.")) return;
    setBusy("gjenopne");
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/dokumenter/${dok.id}/gjenopne`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke gjenåpne");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack fane-mobil skjema">
      <div className="card card-pad">
        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <Link className="linkish" href={`/ordre/${orderId}/dokumentasjon`}>
              ← Dokumentasjon
            </Link>
            <h2 style={{ margin: "6px 0 2px" }}>{mal.title}</h2>
            <div className="tiny muted">
              {mal.lovgrunnlag}
              {mal.beskrivelse && ` · ${mal.beskrivelse}`}
            </div>
          </div>
          <span className="row" style={{ flexWrap: "wrap" }}>
            {laast ? (
              <span className="pill ferdig">Ferdig · signert av {dok.signed_name} {formatDate(dok.signed_at)}</span>
            ) : (
              <span className="tiny muted">{lagrar ? "Lagrer…" : lagra ? `Lagret ${lagra}` : "Endringer lagres automatisk"}</span>
            )}
            <a className="button secondary" href={`/api/orders/${orderId}/dokumenter/${dok.id}/pdf`} target="_blank" rel="noreferrer">
              {laast ? "PDF" : "Forhåndsvis PDF"}
            </a>
            {laast && erAdmin && (
              <button type="button" className="button ghost" onClick={gjenopne} disabled={busy !== null}>
                {busy === "gjenopne" ? "Gjenåpner…" : "Gjenåpne"}
              </button>
            )}
          </span>
        </div>
        {error && <div className="banner error" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}
        {laast && (
          <div className="banner info" style={{ marginTop: 10, marginBottom: 0 }}>
            Skjemaet er fullført og låst. Signert i Devello av {dok.signed_name} {formatDate(dok.signed_at)}.
          </div>
        )}
      </div>

      {mal.sections.map((s) =>
        s.repeat ? (
          <div key={s.key} className="card">
            <div className="card-header">
              <span className="label" style={{ marginBottom: 0 }}>
                {s.title}
              </span>
              {!laast && (
                <button type="button" className="linkish" onClick={() => leggTilRad(s)}>
                  + {s.repeat.addLabel}
                </button>
              )}
            </div>
            {s.help && <p className="tiny muted card-pad" style={{ paddingTop: 0, paddingBottom: 0, marginBottom: 6 }}>{s.help}</p>}
            <div className="skjema-rader">
              {(Array.isArray(data[s.key]) ? (data[s.key] as Record<string, Feltverdi>[]) : []).map((rad, i) => (
                <div key={i} className="skjema-rad">
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <span className="tiny muted" style={{ fontWeight: 600 }}>
                      Rad {i + 1}
                    </span>
                    {!laast && (
                      <button type="button" className="linkish" onClick={() => fjernRad(s.key, i)}>
                        Fjern
                      </button>
                    )}
                  </div>
                  <div className="grid-2">
                    {s.fields.map((f) => (
                      <FeltInput key={f.key} felt={f} verdi={rad[f.key]} laast={laast} onChange={(v) => settRad(s.key, i, f.key, v)} />
                    ))}
                  </div>
                </div>
              ))}
              {(!Array.isArray(data[s.key]) || (data[s.key] as unknown[]).length === 0) && (
                <div className="empty">Ingen rader ennå.</div>
              )}
            </div>
          </div>
        ) : (
          <div key={s.key} className="card card-pad">
            <span className="label">{s.title}</span>
            {s.help && <p className="tiny muted" style={{ marginBottom: 12 }}>{s.help}</p>}
            <div className="skjema-felt">
              {s.fields.map((f) => (
                <FeltInput key={f.key} felt={f} verdi={data[f.key] as Feltverdi | undefined} laast={laast} onChange={(v) => sett(f.key, v)} />
              ))}
            </div>
          </div>
        ),
      )}

      {!laast && (
        <div className="card card-pad fullfor">
          <span className="label">{mal.signature.label}</span>
          {manglar.length > 0 ? (
            <div className="banner warning">
              <strong>
                {manglar.length} {manglar.length === 1 ? "påkrevd felt mangler" : "påkrevde felt mangler"}
              </strong>
              <ul style={{ margin: "6px 0 0 18px" }}>
                {manglar.slice(0, 12).map((m) => (
                  <li key={m}>{m}</li>
                ))}
                {manglar.length > 12 && <li>… og {manglar.length - 12} til</li>}
              </ul>
            </div>
          ) : (
            <p className="tiny muted">Alle påkrevde felt er fylt ut. Signaturen er navnet ditt og tidspunktet, merket «Signert i Devello».</p>
          )}
          <button type="button" className="button" disabled={busy !== null || manglar.length > 0 || lagrar} onClick={fullfor}>
            {busy === "fullfor" ? "Lager PDF…" : "Fullfør og signer"}
          </button>
        </div>
      )}
    </div>
  );
}

function FeltInput({
  felt,
  verdi,
  laast,
  onChange,
}: {
  felt: Felt;
  verdi: Feltverdi | undefined;
  laast: boolean;
  onChange: (v: Feltverdi) => void;
}) {
  const v = verdi ?? "";
  const id = `f-${felt.key}`;
  const req = felt.required ? <span className="paakravd" title="Påkrevd"> *</span> : null;

  if (felt.type === "check3") {
    return (
      <div className="field check3-felt">
        <span className="label">
          {felt.label}
          {req}
        </span>
        <div className="check3">
          {(
            [
              ["ok", "OK"],
              ["avvik", "Avvik"],
              ["ia", "Ikke aktuelt"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={`check3-knapp ${val}${v === val ? " valgt" : ""}`}
              disabled={laast}
              onClick={() => onChange(v === val ? "" : val)}
            >
              {label}
            </button>
          ))}
        </div>
        {felt.help && <span className="hint">{felt.help}</span>}
      </div>
    );
  }

  if (felt.type === "checkbox") {
    return (
      <label className="field checkbox-felt" style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <input type="checkbox" checked={v === true} disabled={laast} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 4 }} />
        <span>
          {felt.label}
          {req}
          {felt.help && <span className="hint" style={{ display: "block" }}>{felt.help}</span>}
        </span>
      </label>
    );
  }

  if (felt.type === "select") {
    return (
      <label className="field" htmlFor={id}>
        <span className="label">
          {felt.label}
          {req}
        </span>
        <select id={id} className="input" value={String(v)} disabled={laast} onChange={(e) => onChange(e.target.value)}>
          <option value="">— velg —</option>
          {felt.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {felt.help && <span className="hint">{felt.help}</span>}
      </label>
    );
  }

  if (felt.type === "textarea") {
    return (
      <label className="field" htmlFor={id} style={{ gridColumn: "1 / -1" }}>
        <span className="label">
          {felt.label}
          {req}
        </span>
        <textarea id={id} className="input" rows={3} value={String(v)} disabled={laast} onChange={(e) => onChange(e.target.value)} />
        {felt.help && <span className="hint">{felt.help}</span>}
      </label>
    );
  }

  if (felt.type === "measure") {
    return (
      <label className="field" htmlFor={id}>
        <span className="label">
          {felt.label}
          {req}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <input id={id} className="input" inputMode="decimal" value={String(v)} disabled={laast} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 160 }} />
          <span className="muted">{felt.unit}</span>
        </span>
        {felt.limit && <span className="hint krav">Krav: {felt.limit}</span>}
        {felt.help && <span className="hint">{felt.help}</span>}
      </label>
    );
  }

  return (
    <label className="field" htmlFor={id}>
      <span className="label">
        {felt.label}
        {req}
      </span>
      <span className="row" style={{ gap: 6 }}>
        <input
          id={id}
          className="input"
          type={felt.type === "date" ? "date" : "text"}
          inputMode={felt.type === "number" ? "decimal" : undefined}
          value={String(v)}
          disabled={laast}
          onChange={(e) => onChange(e.target.value)}
        />
        {felt.type === "number" && felt.unit && <span className="muted">{felt.unit}</span>}
      </span>
      {felt.help && <span className="hint">{felt.help}</span>}
    </label>
  );
}
