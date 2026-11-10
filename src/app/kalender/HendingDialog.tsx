"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { OrdreSok, type OrdreValg } from "@/components/OrdreSok";
import type { KalenderHending, Kollega } from "@/lib/kalender/hent";
import {
  HENDING_NAMN,
  HENDING_TYPAR,
  fraSkjema,
  isoDato,
  klokke,
  leggTilDagar,
  overlappar,
  tidTekst,
  type HendingType,
} from "@/lib/kalender/tid";

/** Det skjemaet startar med når ein ny avtale blir laga. */
export interface Forslag {
  kind?: HendingType;
  start: Date;
  slutt: Date;
  heileDagen?: boolean;
  deltakarar?: string[];
  ordre?: OrdreValg | null;
}

/**
 * Ein avtale i kalenderen: oppdrag på ein ordre, møte, fravær eller anna.
 *
 * Oppdrag krev ordre og minst éin montør; tittelen kan stå tom, då gjeld
 * ordretittelen. Alt anna krev tittel, og kan ha null deltakarar (då gjeld
 * det heile firmaet). Skjemaet sjekkar mot kalenderen mens ein skriv og
 * åtvarar når nokon alt er oppteken — men stoppar ikkje: sjefen veit best.
 *
 * Utan rett til å endre blir avtalen vist, ikkje redigert.
 */
export function HendingDialog({
  open,
  onClose,
  onLagra,
  kolleger,
  hending,
  forslag,
  kanRedigere,
}: {
  open: boolean;
  onClose: () => void;
  onLagra: () => void;
  kolleger: Kollega[];
  /** Avtalen som skal endrast. Utan: ny avtale frå forslaget. */
  hending?: KalenderHending | null;
  forslag?: Forslag | null;
  kanRedigere: boolean;
}) {
  if (!open) return null;
  const tittel = hending ? (kanRedigere ? "Endre avtale" : HENDING_NAMN[hending.kind]) : "Ny avtale";
  return (
    <Modal open={open} onClose={onClose} title={tittel}>
      {hending && !kanRedigere ? (
        <Visning hending={hending} onClose={onClose} />
      ) : (
        <Skjema
          key={hending?.id ?? "ny"}
          onClose={onClose}
          onLagra={onLagra}
          kolleger={kolleger}
          hending={hending ?? null}
          forslag={forslag ?? null}
        />
      )}
    </Modal>
  );
}

function Visning({ hending, onClose }: { hending: KalenderHending; onClose: () => void }) {
  const start = new Date(hending.starts_at);
  const slutt = new Date(hending.ends_at);
  return (
    <div className="kontakt-panel ny-post-panel">
      <Rad etikett="Hva">
        <strong>{hending.title}</strong> <span className={`kal-merke ${hending.kind}`}>{HENDING_NAMN[hending.kind]}</span>
      </Rad>
      {hending.order && (
        <Rad etikett="Ordre">
          <Link className="lenke" href={`/ordre/${hending.order.id}`}>
            #{hending.order.order_no} · {hending.order.title}
          </Link>
          <div className="hint">{[hending.order.customer_name, hending.order.site_address].filter(Boolean).join(" · ")}</div>
        </Rad>
      )}
      <Rad etikett="Når">
        {new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long" }).format(start)} ·{" "}
        {tidTekst({ start, slutt, heileDagen: hending.all_day })}
      </Rad>
      <Rad etikett="Hvem">{hending.deltakarar.map((d) => d.navn).join(", ") || "Alle"}</Rad>
      {hending.location && <Rad etikett="Sted">{hending.location}</Rad>}
      {hending.description && (
        <Rad etikett="Beskrivelse">
          <span style={{ whiteSpace: "pre-wrap" }}>{hending.description}</span>
        </Rad>
      )}
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Lukk
        </button>
      </div>
    </div>
  );
}

function Rad({ etikett, children }: { etikett: string; children: React.ReactNode }) {
  return (
    <div className="kontakt-rad topp">
      <span className="kontakt-rad-etikett">{etikett}</span>
      <div style={{ paddingTop: 8 }}>{children}</div>
    </div>
  );
}

function Skjema({
  onClose,
  onLagra,
  kolleger,
  hending,
  forslag,
}: {
  onClose: () => void;
  onLagra: () => void;
  kolleger: Kollega[];
  hending: KalenderHending | null;
  forslag: Forslag | null;
}) {
  // Startverdiane: avtalen som blir endra, eller forslaget frå kalenderen.
  const start0 = hending ? new Date(hending.starts_at) : (forslag?.start ?? new Date());
  const slutt0 = hending ? new Date(hending.ends_at) : (forslag?.slutt ?? new Date(start0.getTime() + 60 * 60 * 1000));
  const heile0 = hending ? hending.all_day : Boolean(forslag?.heileDagen);
  // Ein heildagsavtale sluttar ved midnatt dagen etter; skjemaet viser siste dag.
  const sisteDag0 = heile0 ? leggTilDagar(slutt0, -1) : slutt0;
  const ordre0: OrdreValg | null = hending?.order
    ? {
        id: hending.order.id,
        order_no: hending.order.order_no,
        title: hending.order.title,
        customer_name: hending.order.customer_name,
        site_address: hending.order.site_address,
      }
    : (forslag?.ordre ?? null);

  const [kind, setKind] = useState<HendingType>(hending?.kind ?? forslag?.kind ?? "oppdrag");
  const [ordre, setOrdre] = useState<OrdreValg | null>(ordre0);
  const [ordreTekst, setOrdreTekst] = useState(ordre0 ? `#${ordre0.order_no} ${ordre0.title}` : "");
  const [tittel, setTittel] = useState(hending?.egen_tittel ?? "");
  const [deltakarar, setDeltakarar] = useState<string[]>(
    hending ? hending.deltakarar.map((d) => d.id) : (forslag?.deltakarar ?? []),
  );
  const [fraDato, setFraDato] = useState(isoDato(start0));
  const [fraKl, setFraKl] = useState(heile0 ? "07:00" : klokke(start0));
  const [tilDato, setTilDato] = useState(isoDato(sisteDag0));
  const [tilKl, setTilKl] = useState(heile0 ? "15:00" : klokke(slutt0));
  const [heileDagen, setHeileDagen] = useState(heile0);
  const [sted, setSted] = useState(hending?.location ?? "");
  const [beskrivelse, setBeskrivelse] = useState(hending?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kollisjonar, setKollisjonar] = useState<KalenderHending[]>([]);

  // Tidsrommet slik det blir lagra. Null når skjemaet ikkje er ferdig utfylt.
  const tid = useMemo(() => {
    if (heileDagen) {
      const s = fraSkjema(fraDato);
      const t = fraSkjema(tilDato);
      return s && t ? { start: s, slutt: leggTilDagar(t, 1) } : null;
    }
    const s = fraSkjema(fraDato, fraKl);
    const t = fraSkjema(tilDato, tilKl);
    return s && t ? { start: s, slutt: t } : null;
  }, [heileDagen, fraDato, fraKl, tilDato, tilKl]);
  const tidFeil = tid && tid.slutt <= tid.start ? "Slutten må være etter starten." : null;

  // Er nokon av deltakarane alt oppteken i tidsrommet? Sjekka mot kalenderen
  // mens ein fyller ut, ikkje berre mot veka som står på skjermen.
  const startMs = tid?.start.getTime();
  const sluttMs = tid?.slutt.getTime();
  const deltakarNokkel = deltakarar.join(",");
  useEffect(() => {
    if (startMs === undefined || sluttMs === undefined || sluttMs <= startMs || !deltakarNokkel) {
      setKollisjonar([]);
      return;
    }
    const valde = new Set(deltakarNokkel.split(","));
    const t = setTimeout(async () => {
      try {
        const fra = new Date(startMs).toISOString();
        const til = new Date(sluttMs).toISOString();
        const res = await fetch(`/api/kalender?fra=${encodeURIComponent(fra)}&til=${encodeURIComponent(til)}`);
        if (!res.ok) return;
        const payload = (await res.json()) as { hendingar: KalenderHending[] };
        setKollisjonar(
          payload.hendingar.filter(
            (h) =>
              h.id !== hending?.id &&
              h.deltakarar.some((d) => valde.has(d.id)) &&
              overlappar(
                { start: new Date(h.starts_at), slutt: new Date(h.ends_at) },
                { start: new Date(startMs), slutt: new Date(sluttMs) },
              ),
          ),
        );
      } catch {
        // Åtvaringa er ei hjelp, ikkje ein sperre.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [startMs, sluttMs, deltakarNokkel, hending?.id]);

  function settFraDato(v: string) {
    // Flyttar ein starten, flyttar slutten med, så lengda blir verande.
    const gammal = fraSkjema(fraDato);
    const ny = fraSkjema(v);
    const til = fraSkjema(tilDato);
    setFraDato(v);
    if (gammal && ny && til) {
      const dagar = Math.round((til.getTime() - gammal.getTime()) / 86_400_000);
      setTilDato(isoDato(leggTilDagar(ny, Math.max(0, dagar))));
    }
  }

  function vekslaDeltakar(id: string) {
    setDeltakarar((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    if (!tid) return setError("Velg dato og klokkeslett.");
    if (tidFeil) return setError(tidFeil);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(hending ? `/api/kalender/${hending.id}` : "/api/kalender", {
        method: hending ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          order_id: kind === "oppdrag" ? ordre?.id : null,
          title: tittel,
          description: beskrivelse,
          location: sted,
          starts_at: tid.start.toISOString(),
          ends_at: tid.slutt.toISOString(),
          all_day: heileDagen,
          deltakarar,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      onLagra();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function slett() {
    if (!hending || !confirm("Slette avtalen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/kalender/${hending.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette");
      onLagra();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const namn = new Map(kolleger.map((k) => [k.id, k.navn]));

  return (
    <form onSubmit={lagre}>
      {error && <div className="banner error">{error}</div>}
      <div className="kontakt-panel ny-post-panel">
        <div className="kontakt-rad">
          <span className="kontakt-rad-etikett">Type</span>
          <div className="type-switch kal-typeval" role="radiogroup">
            {HENDING_TYPAR.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={kind === t}
                className={`type-option${kind === t ? " active" : ""}`}
                onClick={() => setKind(t)}
              >
                <span className={`kal-prikk ${t}`} /> {HENDING_NAMN[t]}
              </button>
            ))}
          </div>
        </div>

        {kind === "oppdrag" && (
          <div className="kontakt-rad topp">
            <span className="kontakt-rad-etikett">Ordre</span>
            <div>
              <OrdreSok
                value={ordreTekst}
                onChange={(v) => {
                  setOrdreTekst(v);
                  if (ordre) setOrdre(null);
                }}
                onVelg={(o) => {
                  setOrdre(o);
                  setOrdreTekst(`#${o.order_no} ${o.title}`);
                }}
                placeholder="Ordrenummer, tittel eller kunde"
                autoFocus={!ordre && !hending}
              />
              {ordre ? (
                <span className="hint">{[ordre.customer_name, ordre.site_address].filter(Boolean).join(" · ") || "Ingen kunde på ordren"}</span>
              ) : (
                <span className="hint">Søk blant aktive ordrer.</span>
              )}
            </div>
          </div>
        )}

        <label className="kontakt-rad">
          <span className="kontakt-rad-etikett">Tittel</span>
          <input
            className="input"
            value={tittel}
            onChange={(e) => setTittel(e.target.value)}
            placeholder={
              kind === "oppdrag"
                ? (ordre?.title ?? "Ordretittelen brukes om feltet står tomt")
                : kind === "mote"
                  ? "F.eks. Mandagsmøte"
                  : kind === "fravaer"
                    ? "F.eks. Ferie, kurs, sykemeldt"
                    : ""
            }
            required={kind !== "oppdrag"}
          />
        </label>

        <div className="kontakt-rad topp">
          <span className="kontakt-rad-etikett">Hvem</span>
          <div>
            <div className="kal-deltakarar">
              {kolleger.map((k) => (
                <label key={k.id} className={`kal-deltakar${deltakarar.includes(k.id) ? " valt" : ""}`}>
                  <input type="checkbox" checked={deltakarar.includes(k.id)} onChange={() => vekslaDeltakar(k.id)} />
                  {k.navn}
                </label>
              ))}
            </div>
            {kind !== "oppdrag" && deltakarar.length === 0 && (
              <span className="hint">Ingen valgt: gjelder hele firmaet.</span>
            )}
          </div>
        </div>

        <div className="kontakt-skilje">Når</div>
        <div className="kontakt-rad">
          <span className="kontakt-rad-etikett">Fra</span>
          <div className="kal-tid">
            <input className="input" type="date" value={fraDato} onChange={(e) => settFraDato(e.target.value)} required />
            {!heileDagen && (
              <input className="input" type="time" value={fraKl} step={900} onChange={(e) => setFraKl(e.target.value)} required />
            )}
          </div>
        </div>
        <div className="kontakt-rad">
          <span className="kontakt-rad-etikett">Til</span>
          <div className="kal-tid">
            <input className="input" type="date" value={tilDato} min={fraDato} onChange={(e) => setTilDato(e.target.value)} required />
            {!heileDagen && (
              <input className="input" type="time" value={tilKl} step={900} onChange={(e) => setTilKl(e.target.value)} required />
            )}
          </div>
        </div>
        <div className="kontakt-rad">
          <span />
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={heileDagen} onChange={(e) => setHeileDagen(e.target.checked)} />
            Hele dagen
          </label>
        </div>
        {tidFeil && <div className="banner warning">{tidFeil}</div>}
        {kollisjonar.length > 0 && (
          <div className="banner warning">
            <strong>Allerede opptatt:</strong>
            <ul className="kal-kollisjonar">
              {kollisjonar.map((h) => {
                const kven = h.deltakarar.filter((d) => deltakarar.includes(d.id)).map((d) => namn.get(d.id) ?? d.navn);
                return (
                  <li key={h.id}>
                    {kven.join(", ")} — {HENDING_NAMN[h.kind].toLowerCase()} «{h.order ? `#${h.order.order_no} ` : ""}
                    {h.title}» {tidTekst({ start: new Date(h.starts_at), slutt: new Date(h.ends_at), heileDagen: h.all_day })}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="kontakt-skilje">Detaljer</div>
        <label className="kontakt-rad">
          <span className="kontakt-rad-etikett">Sted</span>
          <input
            className="input"
            value={sted}
            onChange={(e) => setSted(e.target.value)}
            placeholder={kind === "oppdrag" ? (ordre?.site_address ?? "Adressen på ordren") : "F.eks. kontoret, Teams"}
          />
        </label>
        <label className="kontakt-rad topp">
          <span className="kontakt-rad-etikett">Beskrivelse</span>
          <textarea
            className="textarea"
            style={{ minHeight: 70 }}
            value={beskrivelse}
            onChange={(e) => setBeskrivelse(e.target.value)}
            placeholder={kind === "oppdrag" ? "Det montøren må vite: nøkkel, kontaktperson, hva som skal gjøres" : ""}
          />
        </label>
      </div>

      <div className="modal-actions">
        {hending && (
          <button type="button" className="button danger" onClick={slett} disabled={busy} style={{ marginRight: "auto" }}>
            Slett
          </button>
        )}
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
          Avbryt
        </button>
        <button className="button" type="submit" disabled={busy || (kind === "oppdrag" && (!ordre || deltakarar.length === 0))}>
          {busy ? "Lagrer…" : hending ? "Lagre" : "Legg i kalenderen"}
        </button>
      </div>
    </form>
  );
}
