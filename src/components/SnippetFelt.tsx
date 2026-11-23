"use client";

import { useEffect, useRef, useState } from "react";
import { AutoTextarea } from "./AutoTextarea";
import { filtrer, finnUtloeser, MAKS_NAVN, settInn } from "@/lib/ordre/snippets";

export interface Snippet {
  id: string;
  name: string;
  text: string;
}

/**
 * Beskrivelsesfelt med snippets, som i HubSpot.
 *
 * Skriv «#» og et par bokstaver, eller trykk «Snippets»: lista kommer opp
 * under feltet, piltaster og Enter velger, og teksten settes inn der
 * markøren står. «Ny snippet» lager en med en gang — er noe markert i
 * feltet, er det forslaget til tekst — og den settes ikke inn på nytt, for
 * teksten står der alt. Blyanten retter eller sletter en som finnes.
 *
 * Lista er selskapets og hentes første gang den åpnes.
 */
export function SnippetFelt({
  value,
  onChange,
  placeholder,
  minHeight = 110,
  id,
  disabled,
}: {
  value: string;
  onChange: (tekst: string) => void;
  placeholder?: string;
  minHeight?: number;
  id?: string;
  disabled?: boolean;
}) {
  const felt = useRef<HTMLTextAreaElement>(null);
  const rot = useRef<HTMLDivElement>(null);
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [feil, setFeil] = useState<string | null>(null);
  // Lista: åpnet med «#» (start = hvor «#» står) eller fra knappen (start = null).
  const [liste, setListe] = useState<{ start: number | null; q: string } | null>(null);
  const [aktiv, setAktiv] = useState(0);
  // Skjemaet: ny (id null) eller en som rettes.
  const [skjema, setSkjema] = useState<{ id: string | null; name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Markøren slik den sto da feltet mistet fokus — knappen tar fokuset.
  const markor = useRef<{ fra: number; til: number }>({ fra: value.length, til: value.length });
  const nesteMarkor = useRef<number | null>(null);

  const treff = liste ? filtrer(snippets ?? [], liste.q) : [];

  async function hent() {
    if (snippets) return;
    try {
      const res = await fetch("/api/snippets");
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke hente snippets");
      setSnippets(payload.snippets as Snippet[]);
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
      setSnippets([]);
    }
  }

  function lukk() {
    setListe(null);
    setSkjema(null);
    setFeil(null);
  }

  // Klikk utenfor lukker.
  useEffect(() => {
    if (!liste && !skjema) return;
    const utenfor = (e: MouseEvent) => {
      if (rot.current && !rot.current.contains(e.target as Node)) lukk();
    };
    document.addEventListener("mousedown", utenfor);
    return () => document.removeEventListener("mousedown", utenfor);
  }, [liste, skjema]);

  // Etter innsetting: markøren rett etter snippeten.
  useEffect(() => {
    if (nesteMarkor.current === null) return;
    const pos = nesteMarkor.current;
    nesteMarkor.current = null;
    felt.current?.focus();
    felt.current?.setSelectionRange(pos, pos);
  }, [value]);

  function huskMarkor() {
    const el = felt.current;
    if (el) markor.current = { fra: el.selectionStart, til: el.selectionEnd };
  }

  function skriv(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const tekst = e.target.value;
    onChange(tekst);
    const u = finnUtloeser(tekst, e.target.selectionStart);
    if (u) {
      void hent();
      setSkjema(null);
      setListe({ start: u.start, q: u.q });
      setAktiv(0);
    } else if (liste?.start !== null && liste) {
      setListe(null);
    }
  }

  function velg(s: Snippet) {
    const el = felt.current;
    const til = el && document.activeElement === el ? el.selectionStart : markor.current.til;
    const r =
      liste?.start !== null && liste
        ? settInn(value, liste.start, til, s.text)
        : settInn(value, markor.current.fra, markor.current.til, s.text);
    nesteMarkor.current = r.markor;
    onChange(r.tekst);
    lukk();
    // Samme tekst inn igjen gir ingen ny verdi å reagere på.
    if (r.tekst === value) {
      nesteMarkor.current = null;
      el?.focus();
    }
  }

  function tast(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!liste || liste.start === null) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setListe(null);
    } else if (e.key === "ArrowDown" && treff.length) {
      e.preventDefault();
      setAktiv((a) => (a + 1) % treff.length);
    } else if (e.key === "ArrowUp" && treff.length) {
      e.preventDefault();
      setAktiv((a) => (a - 1 + treff.length) % treff.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && treff[aktiv]) {
      e.preventDefault();
      velg(treff[aktiv]);
    }
  }

  function aapneFraKnapp() {
    if (liste || skjema) return lukk();
    void hent();
    setListe({ start: null, q: "" });
    setAktiv(0);
  }

  function nySnippet() {
    const markert = value.slice(markor.current.fra, markor.current.til).trim();
    setSkjema({ id: null, name: liste?.q.trim() ?? "", text: markert || (liste?.start === null ? value.trim() : "") });
    setFeil(null);
  }

  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!skjema) return;
    setBusy(true);
    setFeil(null);
    try {
      const res = await fetch(skjema.id ? `/api/snippets/${skjema.id}` : "/api/snippets", {
        method: skjema.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: skjema.name, text: skjema.text }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      const lagret = payload as Snippet;
      setSnippets((alle) =>
        [...(alle ?? []).filter((x) => x.id !== lagret.id), lagret].sort((a, b) => a.name.localeCompare(b.name, "nb")),
      );
      const varNy = skjema.id === null;
      const fraHash = liste?.start !== null && liste;
      setSkjema(null);
      // Ny snippet laget fra «#navn»: sett den inn der «#navn» sto. Laget fra
      // knappen var teksten hentet fra feltet, og står der alt.
      if (varNy && fraHash) velg(lagret);
      else if (varNy) lukk();
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function slett() {
    if (!skjema?.id || !window.confirm(`Slette snippeten «${skjema.name}»? Tekst som alt er satt inn i ordrer, blir stående.`)) return;
    setBusy(true);
    setFeil(null);
    try {
      const res = await fetch(`/api/snippets/${skjema.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette");
      setSnippets((alle) => (alle ?? []).filter((x) => x.id !== skjema.id));
      setSkjema(null);
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="snippet-felt" ref={rot}>
      <AutoTextarea
        id={id}
        feltRef={felt}
        value={value}
        onChange={skriv}
        onKeyDown={tast}
        onBlur={huskMarkor}
        onSelect={huskMarkor}
        placeholder={placeholder}
        minHeight={minHeight}
        disabled={disabled}
      />
      <div className="snippet-linje">
        <button type="button" className="linkish" onMouseDown={huskMarkor} onClick={aapneFraKnapp} disabled={disabled}>
          # Snippets
        </button>
        <span className="tiny muted">Skriv # i teksten for å sette inn en ferdig tekst.</span>
      </div>

      {(liste || skjema) && (
        <div className="snippet-panel" role="dialog" aria-label="Snippets">
          {feil && <div className="banner error" style={{ margin: 8 }}>{feil}</div>}
          {skjema ? (
            // Ikke <form>: feltet står ofte inne i et annet skjema (Ny ordre).
            <div className="snippet-skjema">
              <strong>{skjema.id ? "Rediger snippet" : "Ny snippet"}</strong>
              <input
                className="input"
                value={skjema.name}
                maxLength={MAKS_NAVN}
                autoFocus
                placeholder="Navn — Elbillader, Sikringsskap, Kjøkken"
                onChange={(e) => setSkjema({ ...skjema, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
              <AutoTextarea
                value={skjema.text}
                minHeight={96}
                placeholder="Teksten som settes inn i beskrivelsen"
                onChange={(e) => setSkjema({ ...skjema, text: e.target.value })}
              />
              <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                {skjema.id && (
                  <button type="button" className="button ghost" onClick={slett} disabled={busy} style={{ marginRight: "auto" }}>
                    Slett
                  </button>
                )}
                <button type="button" className="button secondary" onClick={() => setSkjema(null)} disabled={busy}>
                  Tilbake
                </button>
                <button type="button" className="button" onClick={lagre} disabled={busy || !skjema.name.trim() || !skjema.text.trim()}>
                  {busy ? "Lagrer…" : skjema.id ? "Lagre" : "Lagre snippet"}
                </button>
              </div>
            </div>
          ) : (
            liste && (
              <>
                {liste.start === null && (
                  <input
                    className="input snippet-sok"
                    type="search"
                    autoFocus
                    value={liste.q}
                    placeholder="Søk i snippets"
                    onChange={(e) => {
                      setListe({ start: null, q: e.target.value });
                      setAktiv(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" && treff.length) {
                        e.preventDefault();
                        setAktiv((a) => (a + 1) % treff.length);
                      } else if (e.key === "ArrowUp" && treff.length) {
                        e.preventDefault();
                        setAktiv((a) => (a - 1 + treff.length) % treff.length);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (treff[aktiv]) velg(treff[aktiv]);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        lukk();
                      }
                    }}
                  />
                )}
                <div className="snippet-rader">
                  {snippets === null ? (
                    <div className="snippet-tom">Henter…</div>
                  ) : treff.length === 0 ? (
                    <div className="snippet-tom">
                      {snippets.length === 0
                        ? "Ingen snippets ennå. Lag den første — for eksempel «Elbillader»."
                        : `Ingen snippets passer «${liste.q}».`}
                    </div>
                  ) : (
                    treff.map((s, i) => (
                      <div key={s.id} className={`snippet-rad${i === aktiv ? " active" : ""}`} onMouseEnter={() => setAktiv(i)}>
                        {/* mousedown, ikke click: feltet skal ikke miste markøren først. */}
                        <button type="button" className="snippet-velg" onMouseDown={(e) => e.preventDefault()} onClick={() => velg(s)}>
                          <span className="snippet-navn">{s.name}</span>
                          <span className="snippet-utdrag">{s.text}</span>
                        </button>
                        <button
                          type="button"
                          className="linkish snippet-rediger"
                          title={`Rediger «${s.name}»`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSkjema({ id: s.id, name: s.name, text: s.text });
                            setFeil(null);
                          }}
                        >
                          Rediger
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <button type="button" className="snippet-ny" onMouseDown={(e) => e.preventDefault()} onClick={nySnippet}>
                  + Ny snippet{liste.q.trim() ? ` «${liste.q.trim()}»` : ""}
                </button>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
