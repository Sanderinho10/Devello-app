import Link from "next/link";
import { KONTAKT_EPOST, formatPrice } from "@/lib/billing/katalog";
import type { Tilgang, UbetaltFaktura } from "@/lib/billing/tilgang";

function langDato(iso: string): string {
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

/**
 * Varselet om en forfalt faktura, som i Go: øverst på hver side, uten
 * lukkeknapp. Det står til fakturaen er betalt.
 */
export function BetalingsVarsel({ ubetalt, selskap }: { ubetalt: UbetaltFaktura; selskap: string }) {
  const deaktivert = ubetalt.dagerIgjen <= 0;
  return (
    <div className="betalings-varsel" role="alert">
      <strong>
        {deaktivert ? "Kontoen er deaktivert." : `Faktura ${ubetalt.fakturanr} er ikke betalt.`}
      </strong>{" "}
      {deaktivert ? (
        <>
          Faktura {ubetalt.fakturanr} på {formatPrice(ubetalt.belopNok)} forfalt {langDato(ubetalt.forfall)} og er ikke
          betalt. Kontoen åpnes igjen når betalingen er registrert.
        </>
      ) : (
        <>
          {formatPrice(ubetalt.belopNok)} forfalt {langDato(ubetalt.forfall)}. Kontoen til {selskap} deaktiveres{" "}
          <strong>{langDato(ubetalt.deaktiveres)}</strong> (om {ubetalt.dagerIgjen}{" "}
          {ubetalt.dagerIgjen === 1 ? "dag" : "dager"}) hvis den ikke er betalt.
        </>
      )}{" "}
      Spørsmål om fakturaen: <a href={`mailto:${KONTAKT_EPOST}?subject=${encodeURIComponent(`Faktura ${ubetalt.fakturanr}`)}`}>{KONTAKT_EPOST}</a>
    </div>
  );
}

/** I stedet for siden når selskapet ikke har tilgang. */
export function AbonnementSperre({ tilgang, erAdmin }: { tilgang: Tilgang; erAdmin: boolean }) {
  const deaktivert = tilgang.grunn === "deaktivert";
  return (
    <div className="card abonnement-sperre">
      <div className="abonnement-sperre-ikon" aria-hidden>
        ⏸
      </div>
      <h2>{deaktivert ? "Kontoen er deaktivert" : "Ingen aktivt abonnement"}</h2>
      <p className="muted">
        {deaktivert
          ? "En faktura fra Devello har stått ubetalt i mer enn 30 dager etter forfall. Dataene er tatt vare på, og alt åpnes igjen når betalingen er registrert."
          : tilgang.trialEndsAt
            ? "Prøveperioden er ute. Velg en pakke for å fortsette — tilbud, ordrer og kunder ligger der dere forlot dem."
            : "Velg en pakke for å ta i bruk Devello."}
      </p>
      {deaktivert ? (
        <a className="button" href={`mailto:${KONTAKT_EPOST}?subject=${encodeURIComponent("Deaktivert konto")}`}>
          Kontakt {KONTAKT_EPOST}
        </a>
      ) : erAdmin ? (
        <Link className="button" href="/selskap/abonnement">
          Velg pakke
        </Link>
      ) : (
        <p className="hint">Be en administrator i selskapet om å velge en pakke under Selskap → Abonnement.</p>
      )}
    </div>
  );
}
