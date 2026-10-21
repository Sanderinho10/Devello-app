"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { formatPrice } from "@/lib/billing/katalog";
import { DAGER_TIL_DEAKTIVERING, type TilgangGrunn } from "@/lib/billing/tilgang-regel";

export interface AdminFaktura {
  id: string;
  company_id: string;
  selskap: string;
  fakturanr: string;
  belop_nok: number | string;
  forfall: string;
  betalt_at: string | null;
  created_at: string;
}

export interface AdminSelskap {
  id: string;
  navn: string;
  pakke: string | null;
  prisNok: number | null;
  intervall: "maanad" | "aar" | null;
  sagtOpp: boolean;
  grunn: TilgangGrunn;
  trialEndsAt: string | null;
  /** Dager til sperre for eldste forfalte faktura. Null uten forfalte. */
  dagerIgjen: number | null;
  ubetaltSum: number;
}

type Fane = "ubetalte" | "betalte" | "alle" | "selskaper";

const DAG_MS = 24 * 60 * 60 * 1000;

function dagerMellom(fra: string, til: string): number {
  return Math.round((Date.parse(til.slice(0, 10)) - Date.parse(fra.slice(0, 10))) / DAG_MS);
}

function leggTilDager(iso: string, dager: number): string {
  return new Date(Date.parse(iso) + dager * DAG_MS).toISOString().slice(0, 10);
}

function dato(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

/** Status på én faktura, regnet som sperren i appen (lib/billing/tilgang-regel.ts). */
function fakturaStatus(f: AdminFaktura, idag: string): { tekst: string; klasse: string } {
  if (f.betalt_at) return { tekst: `Betalt ${dato(f.betalt_at)}`, klasse: "ferdig" };
  const over = dagerMellom(f.forfall, idag);
  if (over <= 0) return { tekst: "Ikke forfalt", klasse: "opna" };
  if (over >= DAGER_TIL_DEAKTIVERING) return { tekst: `Sperret · ${over} dager over`, klasse: "sperret" };
  return { tekst: `Forfalt · sperres om ${DAGER_TIL_DEAKTIVERING - over} d`, klasse: "utkast_klar" };
}

const GRUNN: Record<TilgangGrunn, { tekst: string; klasse: string }> = {
  unntak: { tekst: "Unntak", klasse: "bekrefta" },
  abonnement: { tekst: "Aktiv", klasse: "ferdig" },
  prove: { tekst: "Prøveperiode", klasse: "opna" },
  ingen: { tekst: "Uten pakke", klasse: "utkast_klar" },
  deaktivert: { tekst: "Sperret", klasse: "sperret" },
};

type Skjema = { id: string | null; company_id: string; fakturanr: string; belop_nok: string; forfall: string };

/**
 * Abonnementsfakturaene, som i Go: faner med antall, verktøylinje med «Ny
 * faktura» og søk, en tett tabell, og popup med etiketten foran feltene.
 * «Marker betalt» står på raden, så det vanlige går med ett klikk.
 */
export function FakturaAdmin({
  fakturaer,
  selskaper,
  nesteNr,
  idag,
}: {
  fakturaer: AdminFaktura[];
  selskaper: AdminSelskap[];
  nesteNr: string;
  idag: string;
}) {
  const router = useRouter();
  const [fane, setFane] = useState<Fane>("ubetalte");
  const [sok, setSok] = useState("");
  const [skjema, setSkjema] = useState<Skjema | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ubetalte = fakturaer.filter((f) => !f.betalt_at);
  const betalte = fakturaer.filter((f) => f.betalt_at);
  const q = sok.trim().toLowerCase();

  const synlige = useMemo(() => {
    const liste = fane === "ubetalte" ? ubetalte : fane === "betalte" ? betalte : fakturaer;
    const filtrert = q
      ? liste.filter((f) => f.selskap.toLowerCase().includes(q) || f.fakturanr.toLowerCase().includes(q))
      : liste;
    // Ubetalte: eldste forfall først — det som haster øverst.
    return fane === "ubetalte" ? [...filtrert].sort((a, b) => a.forfall.localeCompare(b.forfall)) : filtrert;
  }, [fane, q, fakturaer, ubetalte, betalte]);

  const synligeSelskaper = q ? selskaper.filter((s) => s.navn.toLowerCase().includes(q)) : selskaper;
  const valgbare = selskaper.filter((s) => s.grunn !== "unntak");

  function nyFaktura(selskap?: AdminSelskap) {
    setError(null);
    setSkjema({
      id: null,
      company_id: selskap?.id ?? "",
      fakturanr: nesteNr,
      belop_nok: selskap?.prisNok ? String(selskap.prisNok) : "",
      forfall: leggTilDager(idag, 14),
    });
  }

  function endre(f: AdminFaktura) {
    setError(null);
    setSkjema({ id: f.id, company_id: f.company_id, fakturanr: f.fakturanr, belop_nok: String(Number(f.belop_nok)), forfall: f.forfall.slice(0, 10) });
  }

  async function kall(url: string, method: string, body: unknown, nokkel: string): Promise<boolean> {
    setBusy(nokkel);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Noe gikk galt");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function lagre(event: React.FormEvent) {
    event.preventDefault();
    if (!skjema) return;
    const { id, ...felt } = skjema;
    const ok = id
      ? await kall(`/api/devello/fakturaer/${id}`, "PATCH", { fakturanr: felt.fakturanr, belop_nok: felt.belop_nok, forfall: felt.forfall }, "lagre")
      : await kall("/api/devello/fakturaer", "POST", felt, "lagre");
    if (ok) setSkjema(null);
  }

  async function betalt(f: AdminFaktura | { id: string }, verdi: boolean) {
    const ok = await kall(`/api/devello/fakturaer/${f.id}`, "PATCH", { betalt: verdi }, `betalt-${f.id}`);
    if (ok) setSkjema(null);
  }

  async function slett(id: string) {
    if (!window.confirm("Slette fakturaen? Den forsvinner også fra varselet hos kunden.")) return;
    const ok = await kall(`/api/devello/fakturaer/${id}`, "DELETE", undefined, "slett");
    if (ok) setSkjema(null);
  }

  const redigert = skjema?.id ? fakturaer.find((f) => f.id === skjema.id) ?? null : null;
  const sum = (liste: AdminFaktura[]) => liste.reduce((s, f) => s + Number(f.belop_nok), 0);

  return (
    <>
      <nav className="type-switch kompakt" aria-label="Vis">
        {(
          [
            ["ubetalte", "Ubetalte", ubetalte.length],
            ["betalte", "Betalte", betalte.length],
            ["alle", "Alle", fakturaer.length],
            ["selskaper", "Selskaper", selskaper.length],
          ] as [Fane, string, number][]
        ).map(([id, etikett, antall]) => (
          <button key={id} type="button" className={`type-option${fane === id ? " active" : ""}`} onClick={() => setFane(id)}>
            {etikett}
            <span className="fane-tal">{antall}</span>
          </button>
        ))}
      </nav>

      <div className="verktoylinje">
        <button type="button" className="button" onClick={() => nyFaktura()}>
          Ny faktura
        </button>
        {fane === "ubetalte" && ubetalte.length > 0 && (
          <span className="tiny muted">Utestående {formatPrice(sum(ubetalte))}</span>
        )}
        <div className="verktoylinje-hoyre">
          <input
            className="input"
            type="search"
            value={sok}
            onChange={(e) => setSok(e.target.value)}
            placeholder={fane === "selskaper" ? "Søk på selskap" : "Søk på selskap eller nummer"}
          />
        </div>
      </div>

      {error && !skjema && <div className="banner error">{error}</div>}

      {fane === "selskaper" ? (
        <div className="card allow-overflow">
          <table className="table tabell-mobil">
            <thead>
              <tr>
                <th>Selskap</th>
                <th>Pakke</th>
                <th>Status</th>
                <th className="num">Ubetalt</th>
                <th aria-label="Handlinger" />
              </tr>
            </thead>
            <tbody>
              {synligeSelskaper.map((s) => (
                <tr key={s.id}>
                  <td className="hoved">
                    <strong>{s.navn}</strong>
                  </td>
                  <td className="meta">
                    {s.pakke ? (
                      <>
                        {s.pakke}
                        <span className="muted">
                          {" · "}
                          {formatPrice(s.prisNok ?? 0)}/{s.intervall === "aar" ? "år" : "mnd"}
                          {s.sagtOpp && " · sagt opp"}
                        </span>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="meta">
                    <span className={`pill ${GRUNN[s.grunn].klasse}`}>{GRUNN[s.grunn].tekst}</span>
                    {s.grunn === "prove" && s.trialEndsAt && <span className="tiny muted"> · til {dato(s.trialEndsAt)}</span>}
                    {s.grunn !== "deaktivert" && s.dagerIgjen !== null && (
                      <span className="tiny muted"> · sperres om {s.dagerIgjen} d</span>
                    )}
                  </td>
                  <td className="num meta">{s.ubetaltSum > 0 ? formatPrice(s.ubetaltSum) : <span className="muted">—</span>}</td>
                  <td className="handling">
                    {s.grunn !== "unntak" && (
                      <button type="button" className="button ghost" onClick={() => nyFaktura(s)}>
                        Ny faktura
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : synlige.length === 0 ? (
        <div className="card empty">
          <div className="empty-title">
            {q ? `Ingen treff på «${sok.trim()}».` : fane === "ubetalte" ? "Ingen ubetalte fakturaer" : "Ingen fakturaer ennå"}
          </div>
        </div>
      ) : (
        <div className="card allow-overflow">
          <table className="table klikkbar tabell-mobil">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Selskap</th>
                <th className="num">Beløp</th>
                <th>Forfall</th>
                <th>Status</th>
                <th aria-label="Handlinger" />
              </tr>
            </thead>
            <tbody>
              {synlige.map((f) => {
                const status = fakturaStatus(f, idag);
                return (
                  <tr
                    key={f.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      endre(f);
                    }}
                  >
                    <td className="meta">{f.fakturanr}</td>
                    <td className="hoved">
                      <strong>{f.selskap}</strong>
                    </td>
                    <td className="num belop">{formatPrice(Number(f.belop_nok))}</td>
                    <td className="meta">{dato(f.forfall)}</td>
                    <td className="meta">
                      <span className={`pill ${status.klasse}`}>{status.tekst}</span>
                    </td>
                    <td className="handling">
                      {!f.betalt_at && (
                        <button type="button" className="button secondary" onClick={() => betalt(f, true)} disabled={busy !== null}>
                          {busy === `betalt-${f.id}` ? "Lagrer…" : "Marker betalt"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {fane !== "betalte" && synlige.length > 1 && (
              <tfoot>
                <tr className="sum-rad">
                  <td />
                  <td>Sum</td>
                  <td className="num">{formatPrice(sum(synlige))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <Modal open={skjema !== null} onClose={() => busy === null && setSkjema(null)} title={skjema?.id ? `Faktura ${redigert?.fakturanr ?? ""}` : "Ny faktura"}>
        {skjema && (
          <form onSubmit={lagre}>
            {error && <div className="banner error">{error}</div>}
            {redigert && (
              <p className="tiny muted" style={{ margin: "0 0 10px" }}>
                {fakturaStatus(redigert, idag).tekst}
              </p>
            )}
            <div className="kontakt-panel ny-post-panel">
              <label className="kontakt-rad">
                <span className="kontakt-rad-etikett">Selskap</span>
                {skjema.id ? (
                  <span>{redigert?.selskap}</span>
                ) : (
                  <select
                    className="input"
                    required
                    value={skjema.company_id}
                    onChange={(e) => {
                      const s = selskaper.find((x) => x.id === e.target.value);
                      setSkjema({ ...skjema, company_id: e.target.value, belop_nok: skjema.belop_nok || (s?.prisNok ? String(s.prisNok) : "") });
                    }}
                  >
                    <option value="">Velg selskap</option>
                    {valgbare.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.navn}
                        {s.pakke ? ` — ${s.pakke}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="kontakt-rad">
                <span className="kontakt-rad-etikett">Fakturanr.</span>
                <span className="kort-felt">
                  <input className="input" required value={skjema.fakturanr} onChange={(e) => setSkjema({ ...skjema, fakturanr: e.target.value })} />
                </span>
              </label>
              <label className="kontakt-rad">
                <span className="kontakt-rad-etikett">Beløp (kr)</span>
                <span className="kort-felt">
                  <input
                    className="input"
                    required
                    inputMode="decimal"
                    value={skjema.belop_nok}
                    onChange={(e) => setSkjema({ ...skjema, belop_nok: e.target.value })}
                    placeholder="690"
                  />
                </span>
              </label>
              <label className="kontakt-rad">
                <span className="kontakt-rad-etikett">Forfall</span>
                <span className="kort-felt">
                  <input className="input" type="date" required value={skjema.forfall} onChange={(e) => setSkjema({ ...skjema, forfall: e.target.value })} />
                </span>
              </label>
              <div className="kontakt-rad">
                <span />
                <span className="hint" style={{ marginTop: -4 }}>
                  Ubetalt etter forfall gir varsel hos kunden. Sperres {dato(leggTilDager(skjema.forfall || idag, DAGER_TIL_DEAKTIVERING))} om
                  den ikke er betalt.
                </span>
              </div>
            </div>

            <div className="modal-actions">
              {redigert && (
                <>
                  <button type="button" className="button danger" onClick={() => slett(redigert.id)} disabled={busy !== null} style={{ marginRight: "auto" }}>
                    {busy === "slett" ? "Sletter…" : "Slett"}
                  </button>
                  <button type="button" className="button secondary" onClick={() => betalt(redigert, !redigert.betalt_at)} disabled={busy !== null}>
                    {busy === `betalt-${redigert.id}` ? "Lagrer…" : redigert.betalt_at ? "Angre betaling" : "Marker betalt"}
                  </button>
                </>
              )}
              <button type="button" className="button secondary" onClick={() => setSkjema(null)} disabled={busy !== null}>
                Avbryt
              </button>
              <button type="submit" className="button" disabled={busy !== null}>
                {busy === "lagre" ? "Lagrer…" : skjema.id ? "Lagre" : "Opprett"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
