"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dra en postrad til en ny plass, som i Go.
 *
 * Hele raden løftes og følger musa, og radene den passerer glir unna, så man
 * ser hvor den havner før man slipper. Ved slipp glir raden på plass før
 * rekkefølgen faktisk endres — ellers ville den hoppet.
 *
 * Bygget på pointer-hendelser, ikke nettleserens dra-og-slipp: den gir bare
 * et gjennomsiktig spøkelsesbilde og ingen kontroll over resten av tabellen.
 * Pointer-hendelser virker også med finger på nettbrett.
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

  /** Ny plass ut fra hvor midten av den løftede raden er nå. */
  const regn = useCallback(() => {
    const a = aktivRef.current;
    if (!a || a.setter) return;
    const rader = maal.current;
    const dy = pekerY.current + window.scrollY - startY.current;
    const midt = rader[a.from].top + rader[a.from].h / 2 + dy;
    let over = a.from;
    for (let i = a.from + 1; i < rader.length; i++) {
      if (midt > rader[i].top + rader[i].h / 2) over = i;
    }
    for (let i = a.from - 1; i >= 0; i--) {
      if (midt < rader[i].top + rader[i].h / 2) over = i;
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
      const til = avbryt ? a.from : a.over;
      let maalDy = 0;
      if (til > a.from) for (let i = a.from + 1; i <= til; i++) maalDy += rader[i].h;
      if (til < a.from) for (let i = til; i < a.from; i++) maalDy -= rader[i].h;
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

  /** Kalles fra håndtaket på pointerdown. */
  const start = useCallback(
    (event: React.PointerEvent, section: number, line: number) => {
      if (event.button !== 0 || aktivRef.current) return;
      const rad = (event.currentTarget as HTMLElement).closest("tr");
      const tbody = rad?.parentElement;
      if (!rad || !tbody) return;
      event.preventDefault();

      maal.current = Array.from(tbody.children).map((tr) => {
        const r = tr.getBoundingClientRect();
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

  /** Klasse og forskyvning for hver rad mens det dras. */
  const rad = useCallback(
    (section: number, line: number): { className?: string; style?: React.CSSProperties } => {
      const a = aktiv;
      if (!a || a.section !== section) return {};
      if (line === a.from) {
        return {
          className: a.setter ? "loftet setter" : "loftet",
          style: { transform: `translateY(${a.dy}px)` },
        };
      }
      const h = maal.current[a.from]?.h ?? 0;
      if (line > a.from && line <= a.over) return { style: { transform: `translateY(${-h}px)` } };
      if (line < a.from && line >= a.over) return { style: { transform: `translateY(${h}px)` } };
      return {};
    },
    [aktiv],
  );

  return { start, rad, drar: aktiv?.section ?? null };
}
