"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { InvoiceLine } from "@/lib/faktura/typar";
import type { PogoKunde, PogoKundePost } from "@/lib/regnskap/poweroffice";
import {
  ACCOUNTING_PROVIDER_LABELS,
  INVOICE_DRAFT_STATUS_LABELS,
  INVOICE_STRATEGY_LABELS,
  PRODUCT_MAP_LABELS,
  formatDate,
  formatNok,
  type AccountingProvider,
  type InvoiceDraft,
  type OrderStatus,
  type ProductMapKey,
} from "@/lib/types";

/**
 * Fakturaforslaget på ordren.
 *
 * Tre tilstander: ingenting ennå (kortet sier hva som ligger klart), et
 * forslag (redigerbart, med agentens spørsmål og merknader øverst), og
 * overført (låst, med ordrenummeret i regnskapssystemet). Redigeringen
 * skjer lokalt og lagres med én knapp; koden regner summene på nytt ved
 * lagring, så tallene her og i databasen aldri spriker.
 */

interface Klart {
  timar: number;
  timarKr: number;
  materiellLinjer: number;
  materiellKr: number;
  planlagt: number | null;
  harTilbod: boolean;
}

interface Kopling {
  provider: AccountingProvider;
  feil: boolean;
  manglandeProdukt: ProductMapKey[];
}

type Overfoering =
  | { steg: "bekreft" }
  | { steg: "kunde"; foreslaatt: PogoKundePost }
  | { steg: "kandidatar"; kandidatar: PogoKunde[] };

export function FakturaFane({
  orderId,
  orderStatus,
  draft,
  klart,
  kopling,
}: {
  orderId: string;
  orderStatus: OrderStatus;
  draft: InvoiceDraft | null;
  klart: Klart;
  kopling: Kopling | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>(draft?.lines ?? []);
  const [tekst, setTekst] = useState(draft?.invoice_text ?? "");
  const [ref, setRef] = useState(draft?.customer_reference ?? "");
  const [dirty, setDirty] = useState(false);
  const [overfoering, setOverfoering] = useState<Overfoering | null>(null);

  const laast = draft?.status === "overfort";
  const providerNavn = kopling ? ACCOUNTING_PROVIDER_LABELS[kopling.provider] : "regnskapssystemet";

  async function kall(url: string, body: unknown, nokkel: string): Promise<Record<string, unknown> | null> {
    setBusy(nokkel);
    setError(null);
    try {
      const res = await fetch(url, {
        method: nokkel === "lagre" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        // 409 fra overføringen er et spørsmål, ikke en feil.
        if (res.status === 409 && payload.needsCustomer && payload.foreslaatt) {
          setOverfoering({ steg: "kunde", foreslaatt: payload.foreslaatt as PogoKundePost });
          return null;
        }
        if (res.status === 409 && Array.isArray(payload.kandidatar)) {
          setOverfoering({ steg: "kandidatar", kandidatar: payload.kandidatar as PogoKunde[] });
          return null;
        }
        throw new Error((payload.error as string) ?? "Noe gikk galt");
      }
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function generer() {
    if (draft && !window.confirm("Lage et nytt forslag? Redigeringene dine erstattes. Den gamle versjonen ligger i loggen.")) return;
    const r = await kall(`/api/orders/${orderId}/faktura`, {}, "generer");
    if (r) {
      const d = r as unknown as InvoiceDraft;
      setLines(d.lines);
      setTekst(d.invoice_text ?? "");
      setRef(d.customer_reference ?? "");
      setDirty(false);
      router.refresh();
    }
  }

  async function lagre(): Promise<boolean> {
    const r = await kall(
      `/api/orders/${orderId}/faktura`,
      { lines, invoice_text: tekst, customer_reference: ref },
      "lagre",
    );
    if (r) {
      const d = r as unknown as InvoiceDraft;
      setLines(d.lines);
      setDirty(false);
      router.refresh();
      return true;
    }
    return false;
  }

  async function godkjenn() {
    if (dirty && !(await lagre())) return;
    const r = await kall(`/api/orders/${orderId}/faktura/godkjenn`, {}, "godkjenn");
    if (r) router.refresh();
  }

  async function angre() {
    const r = await kall(`/api/orders/${orderId}/faktura/angre-godkjenning`, {}, "angre");
    if (r) router.refresh();
  }

  async function overfor(body: { createCustomer?: boolean; customerNo?: string } = {}) {
    const r = await kall(`/api/orders/${orderId}/faktura/overfor`, body, "overfor");
    if (r) {
      setOverfoering(null);
      router.refresh();
    }
  }

  function endre(id: string, patch: Partial<InvoiceLine>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  function fjern(id: string) {
    setLines((ls) => ls.filter((l) => l.id !== id));
    setDirty(true);
  }

  function leggTil() {
    setLines((ls) => [
      ...ls,
      {
        id: crypto.randomUUID(),
        kind: "tekst",
        description: "",
        quantity: 1,
        unit: "stk",
        unit_price: null,
        line_total: 0,
        vat_pct: ls[0]?.vat_pct ?? 25,
        included: true,
        sources: [],
        ai_reason: null,
      },
    ]);
    setDirty(true);
  }

  // Summene lokalt mens man redigerer — samme regel som resolveren.
  const subtotal = round2(
    lines.reduce((acc, l) => (l.included && l.unit_price !== null ? acc + Number(l.quantity) * Number(l.unit_price) : acc), 0),
  );
  const vatPct = lines[0]?.vat_pct ?? 25;
  const vat = round2(subtotal * (vatPct / 100));
  const medLinjer = lines.filter((l) => l.included && l.unit_price !== null).length;

  // ---- Ingen forslag ennå ---------------------------------------------------
  if (!draft) {
    const kanLage = orderStatus === "paagaar" || orderStatus === "ferdig";
    return (
      <div className="card card-pad fane-mobil">
        <span className="label">Klart til fakturering</span>
        {error && <div className="banner error">{error}</div>}
        <div className="oppsummering" style={{ marginBottom: 16 }}>
          <div className="oppsummering-post">
            <span className="tiny muted">Tilbud</span>
            <strong>{klart.planlagt === null ? (klart.harTilbod ? "—" : "Ingen") : formatNok(klart.planlagt)}</strong>
            <span className="tiny muted">{klart.harTilbod ? "avtalt pris eks. mva" : "tid og materiell"}</span>
          </div>
          <div className="oppsummering-post">
            <span className="tiny muted">Timer</span>
            <strong>{formatNok(klart.timarKr)}</strong>
            <span className="tiny muted">{formatTimar(klart.timar)} fakturerbare</span>
          </div>
          <div className="oppsummering-post">
            <span className="tiny muted">Materiell</span>
            <strong>{formatNok(klart.materiellKr)}</strong>
            <span className="tiny muted">
              {klart.materiellLinjer} {klart.materiellLinjer === 1 ? "linje" : "linjer"} til salgspris
            </span>
          </div>
        </div>
        <p className="muted tiny" style={{ marginBottom: 14 }}>
          Agenten leser tilbudet, timene og materiellet og foreslår hva som skal faktureres og hvordan
          det forklares. Beløpene regnes av koden fra det som er ført — agenten setter aldri en pris.
        </p>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="button" onClick={generer} disabled={!kanLage || busy !== null}>
            {busy === "generer" ? "Lager forslag…" : "Lag fakturaforslag"}
          </button>
          {!kanLage && (
            <span className="tiny muted">
              {orderStatus === "opna"
                ? "Sett ordren i gang først — et forslag bygger på det som er gjort."
                : orderStatus === "avbrutt"
                  ? "Ordren er avbrutt."
                  : "Ordren er fakturert."}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---- Overført --------------------------------------------------------------
  if (laast) {
    return (
      <div className="stack fane-mobil">
        <div className="card card-pad">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="label" style={{ marginBottom: 0 }}>
              Faktura
            </span>
            <span className="pill ferdig">Overført</span>
          </div>
          <p style={{ marginBottom: 6 }}>
            Overført til {draft.transfer_provider ? ACCOUNTING_PROVIDER_LABELS[draft.transfer_provider] : providerNavn}{" "}
            {formatDate(draft.transferred_at)}
            {draft.transfer_order_no && (
              <>
                {" · ordre "}
                <strong>{draft.transfer_order_no}</strong>
              </>
            )}
            {draft.transfer_customer_no && ` · kundenr. ${draft.transfer_customer_no}`}
          </p>
          <p className="muted tiny">
            Fakturaen ligger som ordreutkast der. Send den fra {providerNavn} — Devello sender aldri.
            Timene og materiellet som er med er låst, og ordren er fakturert.
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <Link className="button secondary" href={`/ordre/${orderId}/timer`}>
              Timer
            </Link>
            <Link className="button secondary" href={`/ordre/${orderId}/materiell`}>
              Materiell
            </Link>
          </div>
        </div>
        <LinjeTabell lines={draft.lines} laast onEndre={() => {}} onFjern={() => {}} />
        <Summer subtotal={draft.totals.subtotal} vat={draft.totals.vat} total={draft.totals.total} vatPct={vatPct} />
        {draft.invoice_text && (
          <div className="card card-pad">
            <span className="label">Fakturatekst</span>
            <p>{draft.invoice_text}</p>
          </div>
        )}
      </div>
    );
  }

  // ---- Forslag ---------------------------------------------------------------
  const godkjent = draft.status === "godkjent";
  const kanOverfore = godkjent && !dirty && kopling && !kopling.feil && kopling.manglandeProdukt.length === 0;

  return (
    <div className="stack fane-mobil">
      <div className="card card-pad">
        <div className="row-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <span className="row" style={{ flexWrap: "wrap" }}>
            <span className="pill paagaar">{INVOICE_STRATEGY_LABELS[draft.strategy]}</span>
            <span className={`pill ${draft.status === "godkjent" ? "ferdig" : draft.status === "feil" ? "avbrutt" : "opna"}`}>
              {INVOICE_DRAFT_STATUS_LABELS[draft.status]}
            </span>
            <span className="tiny muted">
              Forslag {formatDate(draft.generated_at)}
              {draft.approved_at && ` · godkjent ${formatDate(draft.approved_at)}`}
            </span>
          </span>
          <span className="row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="button ghost" onClick={generer} disabled={busy !== null}>
              {busy === "generer" ? "Lager…" : "Nytt forslag"}
            </button>
            {dirty && (
              <button type="button" className="button secondary" onClick={lagre} disabled={busy !== null}>
                {busy === "lagre" ? "Lagrer…" : "Lagre endringer"}
              </button>
            )}
            {godkjent ? (
              <button type="button" className="button secondary" onClick={angre} disabled={busy !== null}>
                Angre godkjenning
              </button>
            ) : (
              <button type="button" className="button" onClick={godkjenn} disabled={busy !== null || medLinjer === 0}>
                {busy === "godkjenn" ? "Godkjenner…" : "Godkjenn"}
              </button>
            )}
            {godkjent && (
              <button
                type="button"
                className="button"
                onClick={() => setOverfoering({ steg: "bekreft" })}
                disabled={!kanOverfore || busy !== null}
                title={
                  !kopling
                    ? "Ingen regnskapssystem er koblet til"
                    : kopling.manglandeProdukt.length
                      ? "Produktmappingen mangler"
                      : dirty
                        ? "Lagre endringene først"
                        : undefined
                }
              >
                Overfør til {providerNavn}
              </button>
            )}
          </span>
        </div>
        {error && <div className="banner error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
        {draft.status === "feil" && draft.transfer_error && !error && (
          <div className="banner error" style={{ marginTop: 12, marginBottom: 0 }}>
            Overføringen feilet: {draft.transfer_error}
            <div style={{ marginTop: 8 }}>
              <button type="button" className="button secondary" onClick={() => overfor()} disabled={busy !== null}>
                {busy === "overfor" ? "Prøver…" : "Prøv igjen"}
              </button>
            </div>
          </div>
        )}
        {godkjent && !kopling && (
          <div className="banner info" style={{ marginTop: 12, marginBottom: 0 }}>
            Ingen regnskapssystem er koblet til. Sett det opp under{" "}
            <Link href="/ordre/innstillinger" style={{ textDecoration: "underline" }}>
              Ordre → Innstillinger
            </Link>
            .
          </div>
        )}
        {godkjent && kopling && kopling.manglandeProdukt.length > 0 && (
          <div className="banner warning" style={{ marginTop: 12, marginBottom: 0 }}>
            Produktmappingen mangler for {kopling.manglandeProdukt.map((k) => PRODUCT_MAP_LABELS[k].toLowerCase()).join(", ")}.{" "}
            <Link href="/ordre/innstillinger" style={{ textDecoration: "underline" }}>
              Sett den under Innstillinger → Regnskapssystem
            </Link>
            .
          </div>
        )}
      </div>

      {overfoering && (
        <OverforDialog
          steg={overfoering}
          providerNavn={providerNavn}
          linjer={medLinjer}
          total={round2(subtotal + vat)}
          sporsmaal={draft.questions}
          busy={busy === "overfor"}
          onAvbryt={() => setOverfoering(null)}
          onOverfor={overfor}
        />
      )}

      {draft.questions.length > 0 && (
        <div className="banner warning" style={{ marginBottom: 0 }}>
          <strong>Spørsmål fra agenten — avklar før overføring</strong>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {draft.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {draft.notes.length > 0 && (
        <div className="banner info" style={{ marginBottom: 0 }}>
          <strong>Merknader</strong>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {draft.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <LinjeTabell lines={lines} laast={false} onEndre={endre} onFjern={fjern} onLeggTil={leggTil} />
      <Summer subtotal={subtotal} vat={vat} total={round2(subtotal + vat)} vatPct={vatPct} />

      <div className="card card-pad">
        <div className="grid-2">
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="label">Fakturatekst</span>
            <textarea
              className="input"
              rows={3}
              value={tekst}
              onChange={(e) => {
                setTekst(e.target.value);
                setDirty(true);
              }}
            />
            <span className="hint">Står øverst på fakturaen. Ingen priser her — de står i linjene.</span>
          </label>
          <label className="field">
            <span className="label">Deres ref.</span>
            <input
              className="input"
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                setDirty(true);
              }}
              placeholder="Kontaktperson hos kunden"
            />
          </label>
        </div>
        {dirty && (
          <button type="button" className="button secondary" onClick={lagre} disabled={busy !== null}>
            {busy === "lagre" ? "Lagrer…" : "Lagre endringer"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const KILDE_MERKE: Record<InvoiceLine["kind"], string> = {
  tilbod_seksjon: "tilbud",
  tilbod_linje: "tilbud",
  timer: "timer",
  materiell: "materiell",
  tekst: "tekst",
};

function LinjeTabell({
  lines,
  laast,
  onEndre,
  onFjern,
  onLeggTil,
}: {
  lines: InvoiceLine[];
  laast: boolean;
  onEndre: (id: string, patch: Partial<InvoiceLine>) => void;
  onFjern: (id: string) => void;
  onLeggTil?: () => void;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="label" style={{ marginBottom: 0 }}>
          Linjer
        </span>
        {!laast && onLeggTil && (
          <button type="button" className="linkish" onClick={onLeggTil}>
            + Legg til linje
          </button>
        )}
      </div>
      {lines.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Ingen linjer</div>
        </div>
      ) : (
        <div className="faktura-tabell">
          <table className="doc-table">
            <thead>
              <tr>
                {!laast && <th style={{ width: 32 }} />}
                <th>Beskrivelse</th>
                <th className="num">Mengde</th>
                <th>Enhet</th>
                <th className="num">Pris</th>
                <th className="num">Sum</th>
                {!laast && <th style={{ width: 32 }} />}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const erTekst = l.unit_price === null;
                const sum = erTekst ? 0 : Number(l.quantity) * Number(l.unit_price);
                const manuell = Boolean(l.unit_price_manual);
                return (
                  <tr key={l.id} className={l.included ? "" : "utelatt"}>
                    {!laast && (
                      <td>
                        <input
                          type="checkbox"
                          checked={l.included}
                          onChange={(e) => onEndre(l.id, { included: e.target.checked })}
                          title={l.included ? "Med på fakturaen" : "Holdt utenfor"}
                        />
                      </td>
                    )}
                    <td>
                      {laast ? (
                        <span>{l.description}</span>
                      ) : (
                        <input
                          className="input"
                          value={l.description}
                          onChange={(e) => onEndre(l.id, { description: e.target.value })}
                          placeholder="Beskrivelse"
                        />
                      )}
                      <div className="chips">
                        <span className={`chip kilde ${manuell ? "manuell" : KILDE_MERKE[l.kind]}`}>
                          {manuell ? "manuell" : KILDE_MERKE[l.kind]}
                          {l.sources.length > 1 && ` · ${l.sources.length} kilder`}
                        </span>
                        {l.ai_reason && <span className="chip" title={l.ai_reason}>{l.ai_reason}</span>}
                      </div>
                    </td>
                    <td className="num">
                      {erTekst ? (
                        <span className="muted">—</span>
                      ) : laast ? (
                        Number(l.quantity).toLocaleString("nb-NO")
                      ) : (
                        <input
                          className="input num"
                          inputMode="decimal"
                          value={String(l.quantity)}
                          onChange={(e) => onEndre(l.id, { quantity: Number(e.target.value.replace(",", ".")) || 0 })}
                          style={{ width: 80 }}
                        />
                      )}
                    </td>
                    <td>
                      {erTekst ? (
                        ""
                      ) : laast ? (
                        l.unit
                      ) : (
                        <input
                          className="input"
                          value={l.unit}
                          onChange={(e) => onEndre(l.id, { unit: e.target.value })}
                          style={{ width: 60 }}
                        />
                      )}
                    </td>
                    <td className="num">
                      {laast ? (
                        erTekst ? <span className="muted">—</span> : formatPris(Number(l.unit_price))
                      ) : (
                        <input
                          className="input num"
                          inputMode="decimal"
                          value={l.unit_price === null ? "" : String(l.unit_price)}
                          placeholder="—"
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            onEndre(l.id, {
                              unit_price: v === "" ? null : Number(v.replace(",", ".")) || 0,
                              unit_price_manual: true,
                            });
                          }}
                          style={{ width: 100 }}
                          title={erTekst ? "Tekstlinje uten pris. Skriv en pris for å gjøre den til en vare-/tjenestelinje." : undefined}
                        />
                      )}
                    </td>
                    <td className="num">{erTekst ? <span className="muted">—</span> : formatNok(sum)}</td>
                    {!laast && (
                      <td>
                        <button type="button" className="linkish" onClick={() => onFjern(l.id)} title="Ta ut linjen">
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Summer({ subtotal, vat, total, vatPct }: { subtotal: number; vat: number; total: number; vatPct: number }) {
  return (
    <div className="card card-pad">
      <div className="row-between tiny" style={{ padding: "3px 0" }}>
        <span className="muted">Sum eks. mva</span>
        <span>{formatNok(subtotal)}</span>
      </div>
      <div className="row-between tiny" style={{ padding: "3px 0" }}>
        <span className="muted">Mva {vatPct} %</span>
        <span>{formatNok(vat)}</span>
      </div>
      <div className="row-between" style={{ marginTop: 6, fontWeight: 600 }}>
        <span>Å betale</span>
        <span>{formatNok(total)}</span>
      </div>
    </div>
  );
}

function OverforDialog({
  steg,
  providerNavn,
  linjer,
  total,
  sporsmaal,
  busy,
  onAvbryt,
  onOverfor,
}: {
  steg: Overfoering;
  providerNavn: string;
  linjer: number;
  total: number;
  sporsmaal: string[];
  busy: boolean;
  onAvbryt: () => void;
  onOverfor: (body?: { createCustomer?: boolean; customerNo?: string }) => void;
}) {
  return (
    <div className="card card-pad overfor-dialog">
      <span className="label">Overfør til {providerNavn}</span>
      <p style={{ marginBottom: 8 }}>
        {linjer} {linjer === 1 ? "linje" : "linjer"} · {formatNok(total)} inkl. mva. Legges som ordreutkast i{" "}
        {providerNavn}; fakturaen sendes derfra.
      </p>
      {sporsmaal.length > 0 && (
        <div className="banner warning">
          Agenten har {sporsmaal.length} {sporsmaal.length === 1 ? "ubesvart spørsmål" : "ubesvarte spørsmål"}. Sjekk dem
          før du overfører.
        </div>
      )}

      {steg.steg === "bekreft" && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="button" onClick={() => onOverfor()} disabled={busy}>
            {busy ? "Overfører…" : "Overfør"}
          </button>
          <button type="button" className="button ghost" onClick={onAvbryt} disabled={busy}>
            Avbryt
          </button>
        </div>
      )}

      {steg.steg === "kunde" && (
        <>
          <div className="banner info">
            Kunden finnes ikke i {providerNavn}. Opprette{" "}
            <strong>{steg.foreslaatt.Name}</strong> ({steg.foreslaatt.IsPerson ? "privatperson" : "bedrift"}
            {steg.foreslaatt.EmailAddress ? `, ${steg.foreslaatt.EmailAddress}` : ""}
            {steg.foreslaatt.PhoneNumber ? `, ${steg.foreslaatt.PhoneNumber}` : ""})?
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="button" onClick={() => onOverfor({ createCustomer: true })} disabled={busy}>
              {busy ? "Overfører…" : "Opprett kunden og overfør"}
            </button>
            <button type="button" className="button ghost" onClick={onAvbryt} disabled={busy}>
              Avbryt
            </button>
          </div>
        </>
      )}

      {steg.steg === "kandidatar" && (
        <>
          <div className="banner info">Flere kunder i {providerNavn} passer. Velg hvilken fakturaen skal til.</div>
          <div className="lead-list" style={{ marginBottom: 10 }}>
            {steg.kandidatar.map((k) => (
              <button
                key={k.Id}
                type="button"
                className="ordre-velger-rad"
                onClick={() => k.CustomerNo && onOverfor({ customerNo: k.CustomerNo })}
                disabled={busy || !k.CustomerNo}
              >
                <span className="ordre-nr">{k.CustomerNo ?? "—"}</span>
                <span className="lead-main">
                  <span style={{ display: "block", fontWeight: 550 }}>{k.Name ?? "(uten navn)"}</span>
                  <span className="tiny muted">
                    {[k.OrganizationNumber, k.EmailAddress, k.PhoneNumber].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="button ghost" onClick={onAvbryt} disabled={busy}>
            Avbryt
          </button>
        </>
      )}
    </div>
  );
}

function formatPris(n: number): string {
  return `${n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function formatTimar(t: number): string {
  return `${t.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} t`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
