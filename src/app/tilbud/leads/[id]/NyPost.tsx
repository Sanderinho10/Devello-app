"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  kategoriForSeksjon,
  kategorierAv,
  kodeFinnes,
  nesteKode,
  normaliserKode,
  prefiksAv,
} from "@/lib/pricelist/koder";
import { PRICE_KIND_LABELS, type PriceItemKind, type PriceListItem, type QuoteLine } from "@/lib/types";

const NY_KATEGORI = "__ny";

/**
 * En post som ikke finnes i prisfilen.
 *
 * To ting man kan ville: en post som bare gjelder dette tilbudet — en
 * spesiell lampe kunden har kjøpt selv — eller en ny post som skal ligge i
 * prisfilen fra nå av, så den dukker opp i søket neste gang og agenten kan
 * bruke den.
 *
 * Skal den lagres, må den få riktig kode. Kodene er kategorier (B er bad, EL
 * er elbillader), og prisfilen er sortert etter dem. Derfor foreslår vi
 * kategorien ut fra seksjonen og neste ledige kode i den, og man kan skrive
 * koden selv — «el040» velger kategorien EL.
 */
export function NyPost({
  kind,
  priceItems,
  lister,
  seksjonstittel,
  startNavn,
  onLeggTil,
  onAvbryt,
}: {
  /** Typen prisrad seksjonen bruker. */
  kind: PriceItemKind;
  /** Alle aktive prisrader, alle typer. */
  priceItems: PriceListItem[];
  /** De aktive prislistene. En lagret post går inn i en av dem. */
  lister: { id: string; kind: PriceItemKind }[];
  seksjonstittel: string;
  startNavn: string;
  onLeggTil: (line: QuoteLine, nyRad: PriceListItem | null) => void;
  onAvbryt: () => void;
}) {
  const rader = useMemo(() => priceItems.filter((item) => item.kind === kind), [priceItems, kind]);
  const kategorier = useMemo(() => kategorierAv(rader), [rader]);
  const listerAvTypen = lister.filter((liste) => liste.kind === kind);

  const foreslatt = kategoriForSeksjon(seksjonstittel, kategorier);

  const [navn, setNavn] = useState(startNavn);
  const [enhet, setEnhet] = useState("stk");
  const [pris, setPris] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [lagre, setLagre] = useState(false);
  const [kategori, setKategori] = useState(foreslatt?.prefiks ?? "");
  const [kode, setKode] = useState(foreslatt ? nesteKode(foreslatt.prefiks, rader) : "");
  const [nyttPrefiks, setNyttPrefiks] = useState("");
  const [nyttKategorinavn, setNyttKategorinavn] = useState("");
  const [lagrer, setLagrer] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);

  const prefiks = kategori === NY_KATEGORI ? nyttPrefiks : kategori;

  function velgKategori(verdi: string) {
    setKategori(verdi);
    if (verdi === NY_KATEGORI) {
      setKode(nyttPrefiks ? nesteKode(nyttPrefiks, rader) : "");
    } else {
      setKode(verdi ? nesteKode(verdi, rader) : "");
    }
  }

  function endreNyttPrefiks(verdi: string) {
    const rent = verdi.replace(/[^A-Za-zÆØÅæøå]/g, "").toUpperCase();
    setNyttPrefiks(rent);
    setKode(rent ? nesteKode(rent, rader) : "");
  }

  /** Koden styrer kategorien: skriver man «el040», er kategorien EL. */
  function endreKode(verdi: string) {
    setKode(verdi.toUpperCase());
    const p = prefiksAv(verdi);
    if (!p) return;
    if (kategorier.some((k) => k.prefiks === p)) {
      setKategori(p);
    } else {
      setKategori(NY_KATEGORI);
      setNyttPrefiks(p);
    }
  }

  // Listen posten havner i: den som alt har kategorien, ellers den største.
  // Et firma har som regel én aktiv liste per type, men ikke alltid.
  const liste = useMemo(() => {
    if (listerAvTypen.length === 0) return null;
    const telling = (listeId: string, bareKategori: boolean) =>
      rader.filter(
        (rad) =>
          rad.price_list_id === listeId && (!bareKategori || prefiksAv(rad.code) === prefiks),
      ).length;
    return [...listerAvTypen].sort(
      (a, b) =>
        telling(b.id, true) - telling(a.id, true) || telling(b.id, false) - telling(a.id, false),
    )[0];
  }, [listerAvTypen, rader, prefiks]);

  const prisTall = Number(pris.replace(",", "."));
  const kodeNorm = kode.trim() ? normaliserKode(kode) : "";

  function valider(): string | null {
    if (!navn.trim()) return "Posten trenger et navn.";
    if (pris.trim() === "" || !Number.isFinite(prisTall) || prisTall < 0) {
      return "Skriv inn en pris, 0 eller mer.";
    }
    if (!lagre) return null;
    if (!liste) return "Det finnes ingen aktiv prisliste å lagre i.";
    if (!prefiks) return "Velg en kategori, så posten havner riktig i prisfilen.";
    if (kategori === NY_KATEGORI) {
      if (kategorier.some((k) => k.prefiks === nyttPrefiks)) {
        return `Kategorien ${nyttPrefiks} finnes allerede — velg den i listen.`;
      }
      if (!nyttKategorinavn.trim()) return "Gi den nye kategorien et navn, for eksempel «Bad».";
    }
    if (!kodeNorm) return "Posten trenger en kode.";
    if (prefiksAv(kodeNorm) !== prefiks) {
      return `Koden må starte med ${prefiks} for å høre til kategorien.`;
    }
    if (kodeFinnes(kodeNorm, rader)) return `Koden ${kodeNorm} finnes allerede.`;
    return null;
  }

  async function leggTil() {
    const problem = valider();
    if (problem) {
      setFeil(problem);
      return;
    }
    setFeil(null);

    if (!lagre) {
      onLeggTil(
        {
          price_item_id: null,
          description: navn.trim(),
          quantity: 1,
          unit: enhet.trim() || "stk",
          unit_price: prisTall,
        },
        null,
      );
      return;
    }

    setLagrer(true);
    try {
      const res = await fetch("/api/price-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price_list_id: liste!.id,
          code: kodeNorm,
          name: navn.trim(),
          description: beskrivelse.trim() || null,
          unit: enhet.trim() || "stk",
          unit_price: prisTall,
          kategori_navn: kategori === NY_KATEGORI ? nyttKategorinavn.trim() : undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre posten");
      const rad = payload.item as PriceListItem;
      onLeggTil(
        {
          price_item_id: rad.id,
          description: rad.name,
          quantity: 1,
          unit: rad.unit,
          unit_price: Number(rad.unit_price),
        },
        rad,
      );
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
    } finally {
      setLagrer(false);
    }
  }

  // Enter legger til, som i søket over. Escape lukker.
  function onKeyDown(event: React.KeyboardEvent) {
    // Bare i tekstfeltene: Enter på en knapp skal trykke på den knappen.
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      void leggTil();
    }
    if (event.key === "Escape") onAvbryt();
  }

  return (
    <div className="ny-post" onKeyDown={onKeyDown}>
      <div className="type-switch ny-post-valg">
        <button
          type="button"
          className={`type-option${!lagre ? " active" : ""}`}
          onClick={() => setLagre(false)}
        >
          Bare dette tilbudet
        </button>
        <button
          type="button"
          className={`type-option${lagre ? " active" : ""}`}
          onClick={() => setLagre(true)}
        >
          Lagre i prisfilen
        </button>
      </div>
      <span className="hint" style={{ marginTop: 0 }}>
        {lagre
          ? "Posten legges i prisfilen under kategorien sin. Neste gang finner du den i søket, og agenten kan bruke den."
          : "Posten gjelder bare her. Prisfilen blir som den er."}
      </span>

      <div className="ny-post-rad">
        <label className="field" style={{ flex: 3 }}>
          <span className="label">Navn</span>
          <input
            className="input"
            value={navn}
            autoFocus
            onChange={(e) => setNavn(e.target.value)}
            placeholder="Punkt for håndklevarmer"
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="label">Enhet</span>
          <input className="input" value={enhet} onChange={(e) => setEnhet(e.target.value)} />
        </label>
        <label className="field" style={{ flex: 1.3 }}>
          <span className="label">Pris eks. mva</span>
          <input
            className="input num"
            inputMode="decimal"
            value={pris}
            onChange={(e) => setPris(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>

      {lagre && !liste && (
        <p className="hint krav">
          Det finnes ingen aktiv {PRICE_KIND_LABELS[kind].toLowerCase()} å lagre i.{" "}
          <Link href="/tilbud/prisfil" style={{ textDecoration: "underline" }}>
            Legg den inn under Prisfil
          </Link>
          , eller legg posten til bare i dette tilbudet.
        </p>
      )}

      {lagre && liste && (
        <>
          <div className="ny-post-rad">
            <label className="field" style={{ flex: 2 }}>
              <span className="label">Kategori</span>
              <select
                className="input"
                value={kategori}
                onChange={(e) => velgKategori(e.target.value)}
              >
                <option value="">Velg kategori…</option>
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
                value={kode}
                onChange={(e) => endreKode(e.target.value)}
                placeholder="B023"
                spellCheck={false}
              />
            </label>
          </div>

          {kategori === NY_KATEGORI && (
            <div className="ny-post-rad">
              <label className="field" style={{ flex: 1 }}>
                <span className="label">Prefiks</span>
                <input
                  className="input"
                  value={nyttPrefiks}
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
                  value={nyttKategorinavn}
                  onChange={(e) => setNyttKategorinavn(e.target.value)}
                  placeholder="Gulvvarme"
                />
              </label>
            </div>
          )}

          <span className="hint" style={{ marginTop: 0 }}>
            {kategori === NY_KATEGORI
              ? "En ny kategori får en overskriftsrad i prisfilen, som de andre, med posten under."
              : prefiks
                ? `Havner under de andre ${prefiks}-postene i prisfilen. Neste ledige kode er foreslått.`
                : "Koden bestemmer hvor posten havner i prisfilen. Skriver du koden, velges kategorien."}
          </span>

          <label className="field" style={{ marginTop: 10 }}>
            <span className="label">Beskrivelse (valgfritt)</span>
            <input
              className="input"
              value={beskrivelse}
              onChange={(e) => setBeskrivelse(e.target.value)}
              placeholder="Hva som er med i prisen"
            />
          </label>
        </>
      )}

      {feil && <div className="banner error" style={{ marginTop: 10 }}>{feil}</div>}

      <div className="ny-post-knapper">
        <button type="button" className="button ghost" onClick={onAvbryt} disabled={lagrer}>
          Avbryt
        </button>
        <button type="button" className="button" onClick={leggTil} disabled={lagrer}>
          {lagrer ? "Lagrer…" : lagre ? "Lagre og legg til" : "Legg til"}
        </button>
      </div>
    </div>
  );
}
