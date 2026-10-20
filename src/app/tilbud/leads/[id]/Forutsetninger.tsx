"use client";

import { useEffect, useRef } from "react";
import { useRadDra } from "./useRadDra";

/**
 * Forutsetningene som en punktliste, slik de står i tilbudet.
 *
 * Et tekstfelt med «én linje per forutsetning» var en regel man måtte lese
 * seg til, og en linje som brakk av seg selv så ut som to punkter uten å
 * være det. Her er hvert punkt sitt eget felt: det man ser er det kunden får.
 *
 * Tastaturet gjør som i en vanlig punktliste: Enter lager et nytt punkt
 * under, Backspace i et tomt punkt fjerner det og går til punktet over.
 * Tomme punkter tas ut når PDF-en lages, så et halvskrevet punkt aldri blir
 * en tom kule i tilbudet.
 *
 * Rekkefølgen endres ved å dra i håndtaket, som postene, eller med
 * piltastene på håndtaket.
 */
export function Forutsetninger({
  punkter,
  onChange,
}: {
  punkter: string[];
  onChange: (punkter: string[]) => void;
}) {
  const felt = useRef<(HTMLTextAreaElement | null)[]>([]);
  // Hvilket punkt som skal ha fokus etter neste tegning.
  const fokus = useRef<number | null>(null);

  useEffect(() => {
    felt.current.forEach(tilpassHoyde);
    if (fokus.current !== null) {
      const el = felt.current[fokus.current];
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
      fokus.current = null;
    }
  });

  function sett(indeks: number, tekst: string) {
    onChange(punkter.map((p, i) => (i === indeks ? tekst : p)));
  }

  function leggTil(etter: number) {
    const neste = [...punkter];
    neste.splice(etter + 1, 0, "");
    fokus.current = etter + 1;
    onChange(neste);
  }

  function flytt(fra: number, til: number) {
    if (fra === til) return;
    const neste = [...punkter];
    const [p] = neste.splice(fra, 1);
    neste.splice(til, 0, p);
    onChange(neste);
  }

  const dra = useRadDra((_gruppe, fra, til) => flytt(fra, til));

  function fjern(indeks: number, flyttFokus: boolean) {
    if (flyttFokus) fokus.current = Math.max(0, indeks - 1);
    onChange(punkter.filter((_, i) => i !== indeks));
  }

  return (
    <div className="punktliste">
      {punkter.length === 0 && (
        <p className="muted tiny" style={{ margin: "2px 0 8px" }}>
          Ingen forutsetninger. Tilbudet sendes uten.
        </p>
      )}

      <ul className={dra.drar !== null ? "drar" : undefined}>
        {punkter.map((punkt, indeks) => (
          <li key={indeks} {...dra.rad(0, indeks, "punkt-rad")}>
            {punkter.length > 1 && (
              <span
                className="grip punkt-grip"
                role="button"
                tabIndex={0}
                aria-label={`Flytt forutsetning ${indeks + 1} av ${punkter.length}`}
                title="Dra for å flytte, eller bruk piltastene"
                onPointerDown={(event) => {
                  // En låst (sendt) liste har skrudd av feltene; håndtaket følger dem.
                  if (!(event.currentTarget as HTMLElement).closest("fieldset:disabled")) {
                    dra.start(event, 0, indeks);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" && indeks > 0) {
                    event.preventDefault();
                    flytt(indeks, indeks - 1);
                  }
                  if (event.key === "ArrowDown" && indeks < punkter.length - 1) {
                    event.preventDefault();
                    flytt(indeks, indeks + 1);
                  }
                }}
              >
                ⠿
              </span>
            )}
            <textarea
              ref={(el) => {
                felt.current[indeks] = el;
              }}
              className="punkt-felt"
              rows={1}
              value={punkt}
              placeholder="Skriv en forutsetning"
              aria-label={`Forutsetning ${indeks + 1}`}
              onChange={(e) => {
                sett(indeks, e.target.value.replace(/\n/g, " "));
                tilpassHoyde(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  leggTil(indeks);
                }
                if (e.key === "Backspace" && punkt === "" && punkter.length > 0) {
                  e.preventDefault();
                  fjern(indeks, true);
                }
              }}
            />
            <button
              type="button"
              className="button danger"
              title="Fjern forutsetning"
              aria-label={`Fjern forutsetning ${indeks + 1}`}
              onClick={() => fjern(indeks, false)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="button ghost"
        style={{ marginLeft: -10 }}
        onClick={() => leggTil(punkter.length - 1)}
      >
        + Legg til forutsetning
      </button>
    </div>
  );
}

/** Feltet vokser med teksten, så en lang forutsetning leses i sin helhet. */
function tilpassHoyde(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
