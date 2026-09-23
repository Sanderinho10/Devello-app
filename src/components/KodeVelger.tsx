"use client";

import { useMemo } from "react";
import {
  kategorierAv,
  kodeFinnes,
  nesteKode,
  normaliserKode,
  prefiksAv,
  type Kategori,
} from "@/lib/pricelist/koder";
import type { PriceListItem } from "@/lib/types";

export const NY_KATEGORI = "__ny";

export interface KodeValg {
  /** Prefikset til kategorien, NY_KATEGORI, eller "" for ingen. */
  kategori: string;
  kode: string;
  nyttPrefiks: string;
  nyttKategorinavn: string;
}

export const TOMT_KODEVALG: KodeValg = {
  kategori: "",
  kode: "",
  nyttPrefiks: "",
  nyttKategorinavn: "",
};

/** Startverdi med en kategori valgt og neste ledige kode fylt inn. */
export function kodevalgFor(kategori: Kategori | null, rader: PriceListItem[]): KodeValg {
  if (!kategori) return TOMT_KODEVALG;
  return { ...TOMT_KODEVALG, kategori: kategori.prefiks, kode: nesteKode(kategori.prefiks, rader) };
}

/** Prefikset valget gjelder, uansett om kategorien er ny eller finnes. */
export function prefiksFor(valg: KodeValg): string {
  return valg.kategori === NY_KATEGORI ? valg.nyttPrefiks : valg.kategori;
}

/** Koden slik den skal lagres, eller null når ingen er skrevet inn. */
export function kodeFor(valg: KodeValg): string | null {
  return valg.kode.trim() ? normaliserKode(valg.kode) : null;
}

/** Navnet på en ny kategori, når det skal lages en overskriftsrad for den. */
export function kategorinavnFor(valg: KodeValg): string | undefined {
  return valg.kategori === NY_KATEGORI ? valg.nyttKategorinavn.trim() : undefined;
}

/**
 * Hva som er galt med valget, eller null når det holder.
 *
 * `paakrevd` skiller de to stedene komponenten brukes: fra et tilbudsutkast
 * må en post som lagres få kategori, ellers er den umulig å finne igjen. I
 * prisfilen er koden valgfri, som den alltid har vært.
 */
export function validerKodevalg(
  valg: KodeValg,
  rader: PriceListItem[],
  paakrevd: boolean,
): string | null {
  const kategorier = kategorierAv(rader);
  const prefiks = prefiksFor(valg);
  const kode = kodeFor(valg);

  if (!prefiks && !kode) {
    return paakrevd ? "Velg en kategori, så posten havner riktig i prisfilen." : null;
  }
  if (valg.kategori === NY_KATEGORI) {
    if (!valg.nyttPrefiks) return "Skriv et prefiks for den nye kategorien, for eksempel «GV».";
    if (kategorier.some((k) => k.prefiks === valg.nyttPrefiks)) {
      return `Kategorien ${valg.nyttPrefiks} finnes allerede — velg den i listen.`;
    }
    if (!valg.nyttKategorinavn.trim()) {
      return "Gi den nye kategorien et navn, for eksempel «Gulvvarme».";
    }
  }
  if (!kode) return "Posten trenger en kode.";
  if (prefiks && prefiksAv(kode) !== prefiks) {
    return `Koden må starte med ${prefiks} for å høre til kategorien.`;
  }
  if (kodeFinnes(kode, rader)) return `Koden ${kode} finnes allerede.`;
  return null;
}

/**
 * Kategori og kode for en ny prisrad.
 *
 * Kodene er kategorier: B er bad, EL er elbillader, og prisfilen er sortert
 * etter dem. Velger man kategori, foreslås neste ledige kode. Skriver man
 * koden selv — «el040» — velges kategorien ut fra prefikset, og et prefiks
 * som ikke finnes, blir en ny kategori.
 */
export function KodeVelger({
  rader,
  verdi,
  onChange,
  paakrevd,
}: {
  /** Prisradene koden må passe inn blant: samme type, og som regel samme liste. */
  rader: PriceListItem[];
  verdi: KodeValg;
  onChange: (verdi: KodeValg) => void;
  paakrevd: boolean;
}) {
  const kategorier = useMemo(() => kategorierAv(rader), [rader]);
  const prefiks = prefiksFor(verdi);

  function velgKategori(kategori: string) {
    const p = kategori === NY_KATEGORI ? verdi.nyttPrefiks : kategori;
    onChange({ ...verdi, kategori, kode: p ? nesteKode(p, rader) : "" });
  }

  function endreNyttPrefiks(tekst: string) {
    const rent = tekst.replace(/[^A-Za-zÆØÅæøå]/g, "").toUpperCase();
    onChange({ ...verdi, nyttPrefiks: rent, kode: rent ? nesteKode(rent, rader) : "" });
  }

  function endreKode(tekst: string) {
    const kode = tekst.toUpperCase();
    const p = prefiksAv(tekst);
    if (!p) {
      onChange({ ...verdi, kode });
    } else if (kategorier.some((k) => k.prefiks === p)) {
      onChange({ ...verdi, kode, kategori: p });
    } else {
      onChange({ ...verdi, kode, kategori: NY_KATEGORI, nyttPrefiks: p });
    }
  }

  return (
    <>
      <div className="ny-post-rad">
        <label className="field" style={{ flex: 2 }}>
          <span className="label">Kategori{paakrevd ? "" : " (valgfritt)"}</span>
          <select
            className="input"
            value={verdi.kategori}
            onChange={(e) => velgKategori(e.target.value)}
          >
            <option value="">{paakrevd ? "Velg kategori…" : "Ingen kategori"}</option>
            {kategorier.map((k) => (
              <option key={k.prefiks} value={k.prefiks}>
                {k.prefiks} – {k.navn ?? "(uten overskrift)"}
              </option>
            ))}
            <option value={NY_KATEGORI}>+ Ny kategori…</option>
          </select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="label">Kode</span>
          <input
            className="input"
            value={verdi.kode}
            onChange={(e) => endreKode(e.target.value)}
            placeholder="B023"
            spellCheck={false}
          />
        </label>
      </div>

      {verdi.kategori === NY_KATEGORI && (
        <div className="ny-post-rad">
          <label className="field" style={{ flex: 1 }}>
            <span className="label">Prefiks</span>
            <input
              className="input"
              value={verdi.nyttPrefiks}
              maxLength={4}
              onChange={(e) => endreNyttPrefiks(e.target.value)}
              placeholder="GV"
              spellCheck={false}
            />
          </label>
          <label className="field" style={{ flex: 3 }}>
            <span className="label">Navn på kategorien</span>
            <input
              className="input"
              value={verdi.nyttKategorinavn}
              onChange={(e) => onChange({ ...verdi, nyttKategorinavn: e.target.value })}
              placeholder="Gulvvarme"
            />
          </label>
        </div>
      )}

      <span className="hint" style={{ marginTop: 6, display: "block" }}>
        {verdi.kategori === NY_KATEGORI
          ? "En ny kategori får en overskriftsrad i prisfilen, som de andre, med posten under."
          : prefiks
            ? `Havner under de andre ${prefiks}-postene i prisfilen. Neste ledige kode er foreslått.`
            : "Koden bestemmer hvor posten havner i prisfilen. Skriver du koden, velges kategorien."}
      </span>
    </>
  );
}
