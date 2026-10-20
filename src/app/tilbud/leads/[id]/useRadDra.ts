"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dra en rad til en ny plass, som i Go: postrader, forutsetninger og hele
 * seksjoner bruker den samme.
 *
 * Hele raden løftes og følger musa, og radene den passerer glir unna, så man
 * ser hvor den havner før man slipper. Ved slipp glir raden på plass før
 * rekkefølgen faktisk endres — ellers ville den hoppet.
 *
 * Bygget på pointer-hendelser, ikke nettleserens dra-og-slipp: den gir bare
 * et gjennomsiktig spøkelsesbilde og ingen kontroll over resten av tabellen.
 * Pointer-hendelser virker også med finger på nettbrett.
 *
 * Elementene som kan dras, merkes med `data-dra-rad` via `rad()`. De må stå
 * etter hverandre under samme forelder; annet innhold mellom dem hoppes over.
 * Avstanden mellom to elementer (margin) blir med når de andre glir unna.
 */

type Aktiv = {
  section: number;
  from: number;
  over: number;
  /** Hvor langt den løftede raden er flyttet, i piksler. */
  dy: number;
  /** Raden glir på plass etter slipp; ingen input da. */
  setter: boolean;
};

type Maal = { top: number; h: number }[];

/** Mellomrommet mellom elementene, målt mellom de to første. */
function mellomrom(m: Maal): number {
  return m.length > 1 ? Math.max(0, m[1].top - m[0].top - m[0].h) : 0;
}

/** Hvor nær kanten av vinduet siden begynner å rulle av seg selv. */
const KANT_TOPP = 70;
/** Nederst ligger handlingslinja, så sonen er høyere der. */
const KANT_BUNN = 120;
const SETT_MS = 160;

export function useRadDra(
  onFlytt: (section: number, from: number, to: number) => void,
) {
  const [aktiv, setAktiv] = useState<Aktiv | null>(null);
  const aktivRef = useRef<Aktiv | null>(null);
  const maal = useRef<Maal>([]);
  const startY = useRef(0);
  const pekerY = useRef(0);
  const ramme = useRef<number | null>(null);
  const onFlyttRef = useRef(onFlytt);
  onFlyttRef.current = onFlytt;

  const sett = useCallback((neste: Aktiv | null) => {
    aktivRef.current = neste;
    setAktiv(neste);
  }, []);

  /**
   * Ny plass: når den løftede radens forkant passerer midten av naboen, bytter
   * de. Med forkanten i stedet for midten trenger ikke en høy seksjon dras
   * hele sin egen høyde før noe skjer.
   */
  const regn = useCallback(() => {
    const a = aktivRef.current;
    if (!a || a.setter) return;
    const rader = maal.current;
    const dy = pekerY.current + window.scrollY - startY.current;
    const topp = rader[a.from].top + dy;
    const bunn = topp + rader[a.from].h;
    let over = a.from;
    for (let i = a.from + 1; i < rader.length; i++) {
      if (bunn > rader[i].top + rader[i].h / 2) over = i;
    }
    for (let i = a.from - 1; i >= 0; i--) {
      if (topp < rader[i].top + rader[i].h / 2) over = i;
    }
    if (dy !== a.dy || over !== a.over) sett({ ...a, dy, over });
  }, [sett]);

  const ryddOpp = useCallback(() => {
    if (ramme.current !== null) cancelAnimationFrame(ramme.current);
    ramme.current = null;
    document.body.classList.remove("drar-rad");
  }, []);

  /** Slipp: la raden gli til plassen sin, og flytt den først når den er der. */
  const slipp = useCallback(
    (avbryt: boolean) => {
      const a = aktivRef.current;
      if (!a || a.setter) return;
      ryddOpp();
      const rader = maal.current;
      const gap = mellomrom(rader);
      const til = avbryt ? a.from : a.over;
      let maalDy = 0;
      if (til > a.from) for (let i = a.from + 1; i <= til; i++) maalDy += rader[i].h + gap;
      if (til < a.from) for (let i = til; i < a.from; i++) maalDy -= rader[i].h + gap;
      sett({ ...a, over: til, dy: maalDy, setter: true });
      window.setTimeout(() => {
        if (til !== a.from) onFlyttRef.current(a.section, a.from, til);
        sett(null);
      }, SETT_MS);
    },
    [ryddOpp, sett],
  );

  useEffect(() => {
    if (!aktiv || aktiv.setter) return;
    const flytt = (e: PointerEvent) => {
      pekerY.current = e.clientY;
      regn();
    };
    const opp = () => slipp(false);
    const tast = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        slipp(true);
      }
    };
    window.addEventListener("pointermove", flytt);
    window.addEventListener("pointerup", opp);
    window.addEventListener("pointercancel", opp);
    window.addEventListener("keydown", tast);
    return () => {
      window.removeEventListener("pointermove", flytt);
      window.removeEventListener("pointerup", opp);
      window.removeEventListener("pointercancel", opp);
      window.removeEventListener("keydown", tast);
    };
    // Lytterne trenger bare å settes opp når draget starter og slutter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv !== null && !aktiv.setter, regn, slipp]);

  useEffect(() => ryddOpp, [ryddOpp]);

  /**
   * Kalles fra håndtaket på pointerdown. `gruppe` skiller lister som står på
   * samme side (postene i hver sin seksjon); `indeks` er plassen i lista.
   */
  const start = useCallback(
    (event: React.PointerEvent, section: number, line: number) => {
      if (event.button !== 0 || aktivRef.current) return;
      const rad = (event.currentTarget as HTMLElement).closest("[data-dra-rad]");
      const forelder = rad?.parentElement;
      if (!rad || !forelder) return;
      event.preventDefault();

      maal.current = Array.from(forelder.children)
        .filter((el) => el.hasAttribute("data-dra-rad"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top + window.scrollY, h: r.height };
        });
      startY.current = event.clientY + window.scrollY;
      pekerY.current = event.clientY;
      document.body.classList.add("drar-rad");
      sett({ section, from: line, over: line, dy: 0, setter: false });

      // Ruller siden når man drar mot kanten, også når musa står stille.
      const steg = () => {
        const y = pekerY.current;
        let fart = 0;
        if (y < KANT_TOPP) fart = -(KANT_TOPP - y) / 4;
        else if (y > window.innerHeight - KANT_BUNN) fart = (y - (window.innerHeight - KANT_BUNN)) / 4;
        if (fart) {
          window.scrollBy(0, fart);
          regn();
        }
        ramme.current = requestAnimationFrame(steg);
      };
      ramme.current = requestAnimationFrame(steg);
    },
    [regn, sett],
  );

  /**
   * Merket og forskyvningen for hvert element som kan dras. Spres på
   * elementet: `<tr {...dra.rad(s, i)}>`. `klasse` er elementets egen klasse.
   */
  const rad = useCallback(
    (
      section: number,
      line: number,
      klasse?: string,
    ): { "data-dra-rad": ""; className?: string; style?: React.CSSProperties } => {
      const merke = { "data-dra-rad": "" as const, className: klasse };
      const a = aktiv;
      if (!a || a.section !== section) return merke;
      const med = (ekstra: string) => [klasse, ekstra].filter(Boolean).join(" ");
      if (line === a.from) {
        return {
          ...merke,
          className: med(a.setter ? "loftet setter" : "loftet"),
          style: { transform: `translateY(${a.dy}px)` },
        };
      }
      const flytt = (maal.current[a.from]?.h ?? 0) + mellomrom(maal.current);
      if (line > a.from && line <= a.over) return { ...merke, style: { transform: `translateY(${-flytt}px)` } };
      if (line < a.from && line >= a.over) return { ...merke, style: { transform: `translateY(${flytt}px)` } };
      return merke;
    },
    [aktiv],
  );

  return { start, rad, drar: aktiv?.section ?? null };
}
