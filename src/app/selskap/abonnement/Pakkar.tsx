"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KONTAKT_EPOST, PAKKAR, formatPrice, trialDaysLeft, type Pakke } from "@/lib/billing/katalog";
import type { Oversikt } from "@/lib/billing/subscription";

/** Som Oversikt, men med perioden som ISO-strenger over nettverket. */
export type OversiktRad = Omit<Oversikt, "periode"> & {
  periode: { start: string; slutt: string; nummer: number };
};

/**
 * Abonnementssiden: prøvetid eller gjeldende pakke, forbruk og estimert
 * kostnad denne perioden, og de fire pakkene som kort — én linje per enhet,
 * som PowerOffice Go viser sine.
 */
export function Pakkar({
  oversikt,
  trialEndsAt,
  partnerCode,
  isAdmin,
}: {
  oversikt: OversiktRad;
  trialEndsAt: string | null;
  partnerCode: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const daysLeft = trialDaysLeft(trialEndsAt);
  const { pakke, abonnement, forbruk, kostnad, bedrePakke, periode } = oversikt;
  const erMikro = abonnement?.interval === "aar";

  async function send(body: Record<string, unknown>, nokkel: string) {
    setBusy(nokkel);
    setError(null);
    try {
      const res = await fetch("/api/company/abonnement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre valget");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      {error && <div className="banner error">{error}</div>}

      {daysLeft !== null && daysLeft > 0 && !abonnement ? (
        <div className="banner info">
          <strong>
            {daysLeft} {daysLeft === 1 ? "dag" : "dager"} igjen
          </strong>{" "}
          av prøveperioden, som varer til {kortDato(trialEndsAt)} — alle moduler er åpne. Forbruket under
          telles, men det blir ikke fakturert.
        </div>
      ) : !abonnement ? (
        <div className="banner warning">Prøveperioden er ute og dere står ikke på noen pakke. Velg en under.</div>
      ) : (
        <div className="banner info">
          Dere står på <strong>{pakke?.name ?? abonnement.packageId}</strong>
          {abonnement.packageId === "tilbud" && abonnement.includedUnits > 0 && " (gammel avtale med inkluderte tilbud)"}
          {" · "}perioden {kortDato(periode.start)} – {kortDato(periode.slutt)}
          {abonnement.cancelAtPeriodEnd && " · sagt opp, virker ut perioden"}
        </div>
      )}

      {/* Forbruk denne perioden */}
      <section className="card card-pad">
        <div className="row-between">
          <strong>Forbruk {erMikro ? "i år" : "denne perioden"}</strong>
          <span className="tiny muted">
            {kortDato(periode.start)} – {kortDato(periode.slutt)}
          </span>
        </div>
        <table className="doc-table" style={{ marginTop: 10 }}>
          <tbody>
            {abonnement && <Rad namn="Grunnpris" belop={abonnement.priceNok} />}
            {abonnement && abonnement.includedUnits > 0 ? (
              <>
                <Rad
                  namn={`Enheter brukt (tilbud ${forbruk.tilbud} + fakturaer ${forbruk.faktura})`}
                  detalj={`${forbruk.tilbud + forbruk.faktura} av ${abonnement.includedUnits} inkludert`}
                  belop={kostnad?.einingar ?? 0}
                />
              </>
            ) : (
              <>
                <Rad
                  namn="Tilbud generert"
                  detalj={abonnement ? `${forbruk.tilbud} × ${formatPrice(abonnement.unitPriceNok.tilbud)}` : String(forbruk.tilbud)}
                  belop={abonnement ? forbruk.tilbud * abonnement.unitPriceNok.tilbud : null}
                />
                <Rad
                  namn="Fakturaer overført"
                  detalj={abonnement ? `${forbruk.faktura} × ${formatPrice(abonnement.unitPriceNok.faktura)}` : String(forbruk.faktura)}
                  belop={abonnement ? forbruk.faktura * abonnement.unitPriceNok.faktura : null}
                />
              </>
            )}
            <Rad
              namn={erMikro ? "Aktive montører i appen denne måneden" : "Aktive montører i appen"}
              detalj={
                abonnement
                  ? erMikro
                    ? `${forbruk.appBrukarar} (${abonnement.includedAppUsers} inkludert) · ${forbruk.appBrukarMaanadar ?? 0} montørmåneder over i år × ${formatPrice(abonnement.appUserPriceNok)}`
                    : `${forbruk.appBrukarar} × ${formatPrice(abonnement.appUserPriceNok)}`
                  : String(forbruk.appBrukarar)
              }
              belop={kostnad?.appBrukarar ?? null}
            />
            {kostnad && (
              <tr>
                <td>
                  <strong>Estimert {erMikro ? "for året" : "for perioden"}</strong>
                </td>
                <td className="tiny muted" />
                <td className="num">
                  <strong>{formatPrice(kostnad.sum)}</strong> <span className="tiny muted">eks. mva</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {bedrePakke && (
          <p className="banner info" style={{ marginTop: 12 }}>
            Med dette forbruket ville dere spart <strong>{formatPrice(bedrePakke.sparerKrPerMaanad)} i måneden</strong> på{" "}
            <strong>{bedrePakke.pakke.name}</strong>.
          </p>
        )}
      </section>

      {/* Pakkene */}
      <div className="plan-grid pakkar">
        {PAKKAR.map((p) => (
          <PakkeKort
            key={p.id}
            pakke={p}
            aktiv={abonnement?.packageId === p.id}
            harAbonnement={Boolean(abonnement)}
            sagtOpp={Boolean(abonnement?.cancelAtPeriodEnd)}
            isAdmin={isAdmin}
            busy={busy}
            onVelg={() => send({ pakke: p.id }, p.id)}
            onSiOpp={() => send({ handling: "si_opp" }, "oppsei")}
            onAngre={() => send({ handling: "angre_oppseiing" }, "angre")}
          />
        ))}
      </div>

      <p className="tiny muted" style={{ margin: "4px 2px 0" }}>
        Alle priser er eks. mva. Kontorbrukere i nettappen er gratis og ubegrenset. Bytter du pakke, starter en ny
        periode i dag. Betaling er ikke koblet på ennå: å velge pakke registrerer avtalen, men det blir ikke sendt
        faktura og ingenting blir trukket.
        {partnerCode && (
          <>
            {" "}
            Registrert med partnerkode <strong>{partnerCode}</strong>.
          </>
        )}{" "}
        Trenger dere mer?{" "}
        <a href={`mailto:${KONTAKT_EPOST}?subject=${encodeURIComponent("Større pakke")}`} style={{ textDecoration: "underline" }}>
          {KONTAKT_EPOST}
        </a>
      </p>
    </div>
  );
}

function Rad({ namn, detalj, belop }: { namn: string; detalj?: string; belop: number | null }) {
  return (
    <tr>
      <td>{namn}</td>
      <td className="tiny muted">{detalj ?? ""}</td>
      <td className="num">{belop === null ? "" : formatPrice(belop)}</td>
    </tr>
  );
}

function PakkeKort({
  pakke,
  aktiv,
  harAbonnement,
  sagtOpp,
  isAdmin,
  busy,
  onVelg,
  onSiOpp,
  onAngre,
}: {
  pakke: Pakke;
  aktiv: boolean;
  harAbonnement: boolean;
  sagtOpp: boolean;
  isAdmin: boolean;
  busy: string | null;
  onVelg: () => void;
  onSiOpp: () => void;
  onAngre: () => void;
}) {
  const aar = pakke.interval === "aar";
  const linjer: string[] = [];
  if (pakke.includedUnits > 0) linjer.push(`${pakke.includedUnits} enheter inkludert (tilbud + fakturaer) per år`);
  if (pakke.unitPriceNok.tilbud > 0) linjer.push(`Per tilbud generert${pakke.includedUnits ? " over" : ""} — ${formatPrice(pakke.unitPriceNok.tilbud)}`);
  if (pakke.unitPriceNok.faktura > 0) linjer.push(`Per faktura overført${pakke.includedUnits ? " over" : ""} — ${formatPrice(pakke.unitPriceNok.faktura)}`);
  if (pakke.includedAppUsers > 0) linjer.push(`${pakke.includedAppUsers} montør i appen inkludert`);
  if (pakke.appUserPriceNok > 0) linjer.push(`Per aktiv montør i appen${pakke.includedAppUsers ? " over" : ""} — ${formatPrice(pakke.appUserPriceNok)}/mnd`);
  linjer.push("Kontorbrukere — gratis");

  return (
    <div className={`card card-pad plan${aktiv ? " chosen" : ""}`}>
      <div className="row-between">
        <strong>{pakke.name}</strong>
        {aktiv && <span className="pill bekrefta">Aktiv</span>}
      </div>
      <div className="tiny muted" style={{ marginTop: 2 }}>
        {pakke.tagline}
      </div>
      <div className="plan-price">
        {formatPrice(pakke.priceNok)}
        <span className="plan-period"> / {aar ? "år" : "mnd"}</span>
      </div>
      <div className="tiny muted">{aar ? "Betales årlig · eks. mva" : "eks. mva"}</div>
      <ul className="plan-features">
        {linjer.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {isAdmin ? (
        aktiv ? (
          sagtOpp ? (
            <button className="button secondary" style={{ width: "100%", justifyContent: "center", marginTop: 18 }} onClick={onAngre} disabled={busy !== null}>
              {busy === "angre" ? "Lagrer…" : "Angre oppsigelsen"}
            </button>
          ) : (
            <button className="button ghost" style={{ width: "100%", justifyContent: "center", marginTop: 18 }} onClick={onSiOpp} disabled={busy !== null}>
              {busy === "oppsei" ? "Lagrer…" : "Avslutt abonnement"}
            </button>
          )
        ) : (
          <button className="button" style={{ width: "100%", justifyContent: "center", marginTop: 18 }} onClick={onVelg} disabled={busy !== null}>
            {busy === pakke.id ? "Lagrer…" : harAbonnement ? "Bytt til denne" : "Abonner"}
          </button>
        )
      ) : (
        <p className="hint" style={{ marginTop: 18 }}>
          Bare administratorer kan endre pakke.
        </p>
      )}
    </div>
  );
}

function kortDato(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" }).format(new Date(iso));
}
