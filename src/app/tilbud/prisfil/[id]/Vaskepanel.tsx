"use client";

import { useMemo, useState } from "react";
import { vaskPrisliste, vaskSamandrag, type Funn } from "@/lib/pricelist/vask";
import { erOverskrift } from "@/lib/pricelist/koder";
import type { PriceListItem } from "@/lib/types";

/**
 * Panelet som viser hva som ser rart ut i prislisten.
 *
 * Det står øverst, over listen, og bare når det er noe å si. Poenget er ikke
 * å rette noe automatisk — panelet peker, mennesket avgjør. Radene lenkes til
 * søkefeltet under, så veien fra «14 rader ligger høyt» til den ene raden som
 * skal endres er ett klikk.
 *
 * Bakgrunn: Star Elektros liste har 241 punktpriser, 61 uten pris og 14 som
 * ligger over 25 ganger medianen. Ingen så det før vi spurte databasen, fordi
 * ingen kan lese 241 rader og huske hva som var rart på rad 180.
 */

const OVERSKRIFT: Record<Funn["type"], string> = {
  uten_pris: "Rader uten pris",
  uteligger: "Uvanlig høye priser",
  duplikat: "Samme navn på flere rader",
};

export function Vaskepanel({
  items,
  onVelgRad,
}: {
  items: PriceListItem[];
  /** Setter søkefeltet i listen under, så raden er ett klikk unna. */
  onVelgRad: (navn: string) => void;
}) {
  const [apen, setApen] = useState<string | null>(null);
  const vask = useMemo(
    () =>
      vaskPrisliste(
        items
          // Overskriftsradene — «B = Bad», 0 kr — deler inn lista og skal
          // stå uten pris. Tatt med ville hver kategori blitt en falsk
          // «rad uten pris».
          .filter((i) => i.active && !erOverskrift(i))
          .map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            unit_price: Number(i.unit_price),
          })),
      ),
    [items],
  );

  const samandrag = vaskSamandrag(vask);
  if (!samandrag) return null;

  return (
    <div className="card">
      <div className="card-header">
        <strong>Gjennomgang av listen</strong>
        <span className="tiny muted">{samandrag}</span>
      </div>
      <div className="card-pad stack" style={{ gap: 10 }}>
        {vask.funn.map((funn) => {
          const er = apen === funn.type;
          return (
            <div key={funn.type} className="banner warning" style={{ display: "block" }}>
              <button
                type="button"
                className="button ghost"
                style={{ padding: 0, textAlign: "left", width: "100%" }}
                onClick={() => setApen(er ? null : funn.type)}
                aria-expanded={er}
              >
                <strong>
                  {OVERSKRIFT[funn.type]} ({funn.rader.length})
                </strong>{" "}
                <span className="tiny">{er ? "skjul" : "vis"}</span>
              </button>

              <p className="tiny" style={{ margin: "6px 0 0" }}>
                {funn.tekst}
              </p>

              {er && (
                <>
                  <ul className="tiny" style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                    {funn.rader.map((rad) => (
                      <li key={rad.id ?? rad.name} style={{ marginBottom: 2 }}>
                        <button
                          type="button"
                          className="button ghost"
                          style={{ padding: 0 }}
                          onClick={() => onVelgRad(rad.name)}
                        >
                          {rad.name}
                        </button>{" "}
                        <span className="muted">{kr(rad.unit_price)}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Valgene står som tekst, ikke som knapper: panelet skal
                      ikke kunne endre prislisten. Endringen gjøres i raden
                      under, der den er synlig og kan angres. */}
                  <p className="tiny muted" style={{ margin: "10px 0 0" }}>
                    Hva som er riktig her er det bare dere som vet:{" "}
                    {funn.valg.join(" · ")}. Klikk på en rad for å finne den i
                    listen under.
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function kr(n: number): string {
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n)} kr`;
}
