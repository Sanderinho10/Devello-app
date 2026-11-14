"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KlikkbarRad } from "@/components/KlikkbarRad";
import { formatNok, type StockLocation } from "@/lib/types";
import { LagerSkjema } from "./LagerSkjema";

type LagerMedTal = StockLocation & {
  /** Hvor mange ulike varer som ligger der. */
  varelinjer: number;
  verdi: number;
  /** Varer med negativ beholdning: tatt ut uten å være ført inn. */
  minus: number;
};

/** Oversikten over biler og lager. Klikk på en rad åpner beholdningen. */
export function LagerListe({
  lager,
  medlemmer,
  meg,
}: {
  lager: LagerMedTal[];
  medlemmer: { id: string; navn: string }[];
  meg: { id: string; erAdmin: boolean };
}) {
  const router = useRouter();
  const [ny, setNy] = useState(false);
  const navn = new Map(medlemmer.map((m) => [m.id, m.navn]));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Biler og lager</h1>
        </div>
        {meg.erAdmin && (
          <button type="button" className="button" onClick={() => setNy(true)}>
            Ny bil eller lager
          </button>
        )}
      </div>

      <div className="card">
        {lager.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen biler ennå</div>
            <div>
              {meg.erAdmin
                ? "Opprett en bil for hver montør. Da kan varer kjøpes inn til bilen og tas ut på ordrene etter hvert som de brukes."
                : "En administrator oppretter bilene."}
            </div>
          </div>
        ) : (
          <div className="tabell-rull">
            <table className="table klikkbar">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Navn</th>
                  <th>Montør</th>
                  <th className="num">Varer</th>
                  <th className="num">Verdi eks. mva</th>
                </tr>
              </thead>
              <tbody>
                {lager.map((l) => (
                  <KlikkbarRad key={l.id} href={`/register/lager/${l.id}`}>
                    <td className="ordre-nr nowrap">#{l.location_no}</td>
                    <td>
                      <Link className="lenke" href={`/register/lager/${l.id}`}>
                        {l.name}
                      </Link>
                      <span className="tiny muted">
                        {" "}
                        · {l.kind === "bil" ? "Bil" : "Lager"}
                        {l.reg_no ? ` · ${l.reg_no}` : ""}
                      </span>
                      {!l.active && <span className="chip" style={{ marginLeft: 8 }}>ute av bruk</span>}
                    </td>
                    <td className="muted">{l.user_id ? (navn.get(l.user_id) ?? "") : ""}</td>
                    <td className="num">
                      {l.varelinjer}
                      {l.minus > 0 && (
                        <span className="tiny" style={{ color: "var(--warning)" }}>
                          {" "}
                          · {l.minus} i minus
                        </span>
                      )}
                    </td>
                    <td className="num">{formatNok(l.verdi)}</td>
                  </KlikkbarRad>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ny && (
        <LagerSkjema
          medlemmer={medlemmer}
          onLukk={() => setNy(false)}
          onLagra={(l) => {
            setNy(false);
            router.push(`/register/lager/${l.id}`);
          }}
        />
      )}
    </>
  );
}
