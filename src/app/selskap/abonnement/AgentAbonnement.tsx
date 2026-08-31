"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  KONTAKT_EPOST,
  formatPrice,
  stoersteKvote,
  trialDaysLeft,
  unitLabel,
} from "@/lib/billing/agents";
import type { AgentStatus } from "@/lib/billing/subscription";

/** Som AgentStatus, men med perioden som ISO-strenger over nettverket. */
export type AgentRad = Omit<AgentStatus, "periode"> & {
  periode: { start: string; slutt: string; nummer: number };
};

export function AgentAbonnement({
  oversikt,
  trialEndsAt,
  partnerCode,
  isAdmin,
}: {
  oversikt: AgentRad[];
  trialEndsAt: string | null;
  partnerCode: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const daysLeft = trialDaysLeft(trialEndsAt);
  const harPakke = oversikt.some((r) => r.abonnement);

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

      {daysLeft !== null && daysLeft > 0 ? (
        <div className="banner info">
          <strong>
            {daysLeft} {daysLeft === 1 ? "dag" : "dager"} igjen
          </strong>{" "}
          av prøveperioden, som varer til {kortDato(trialEndsAt)}. Dere kan bruke
          agentene som normalt — forbruket under telles, men det blir ikke
          fakturert.
        </div>
      ) : (
        !harPakke && (
          <div className="banner warning">
            Prøveperioden er ute og dere står ikke på noen pakke. Velg en for å
            fortsette.
          </div>
        )
      )}

      {oversikt.map((rad) => (
        <section key={rad.agent.id} className="card card-pad">
          <div className="row-between agent-abo-head">
            <div>
              <strong>{rad.agent.name}</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {rad.agent.tagline}
              </p>
            </div>
            {rad.abonnement && (
              <span className="pill bekrefta">
                {rad.planer.find((p) => p.id === rad.abonnement!.planId)?.name ??
                  "Valgt"}
              </span>
            )}
          </div>

          <Forbruk rad={rad} />

          <div className="plan-grid" style={{ marginTop: 18 }}>
            {rad.planer.map((plan) => {
              const valgt = plan.id === rad.abonnement?.planId;
              return (
                <div
                  key={plan.id}
                  className={`card card-pad plan${valgt ? " chosen" : ""}`}
                >
                  <div className="row-between">
                    <strong>{plan.name}</strong>
                    {valgt && <span className="pill bekrefta">Valgt</span>}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {plan.tagline}
                  </div>

                  <div className="plan-price">
                    {formatPrice(plan.priceNok)}
                    <span className="plan-period"> / mnd</span>
                  </div>
                  <div className="tiny muted">eks. mva</div>

                  <ul className="plan-features">
                    <li>
                      <strong>{plan.quota}</strong>{" "}
                      {unitLabel(rad.agent, plan.quota)} i måneden
                    </li>
                    <li>
                      {formatPrice(Math.round(plan.priceNok / plan.quota))} per{" "}
                      {rad.agent.unit.ein} innenfor kvoten
                    </li>
                    <li>
                      {formatPrice(plan.overageNok)} per {rad.agent.unit.ein}{" "}
                      over taket
                    </li>
                  </ul>

                  {isAdmin ? (
                    <button
                      className={`button${valgt ? " secondary" : ""}`}
                      style={{
                        width: "100%",
                        justifyContent: "center",
                        marginTop: 18,
                      }}
                      onClick={() => send({ plan: plan.id }, plan.id)}
                      disabled={busy !== null || valgt}
                    >
                      {busy === plan.id
                        ? "Lagrer…"
                        : valgt
                          ? "Valgt"
                          : rad.abonnement
                            ? "Bytt til denne"
                            : "Velg denne"}
                    </button>
                  ) : (
                    <p className="hint" style={{ marginTop: 18 }}>
                      Bare administratorer kan endre pakke.
                    </p>
                  )}
                </div>
              );
            })}

            <KontaktKort agent={rad.agent} />
          </div>

          {rad.bedrePakke && (
            <p className="banner info" style={{ marginTop: 16 }}>
              Med {rad.brukt} {unitLabel(rad.agent, rad.brukt)} denne perioden
              ville <strong>{rad.bedrePakke.plan.name}</strong> kostet{" "}
              {formatPrice(rad.bedrePakke.sparerKr)} mindre enn pakken dere
              står på.
            </p>
          )}

          {rad.abonnement && isAdmin && (
            <p className="tiny muted" style={{ marginTop: 14 }}>
              {rad.abonnement.cancelAtPeriodEnd ? (
                <>
                  Sagt opp — pakken virker ut perioden, til{" "}
                  {kortDato(rad.periode.slutt)}.{" "}
                  <button
                    className="linkish"
                    onClick={() =>
                      send(
                        {
                          handling: "angre_oppseiing",
                          agent: rad.agent.id,
                        },
                        `angre-${rad.agent.id}`,
                      )
                    }
                    disabled={busy !== null}
                  >
                    Angre oppsigelsen
                  </button>
                </>
              ) : (
                <button
                  className="linkish"
                  onClick={() =>
                    send(
                      { handling: "si_opp", agent: rad.agent.id },
                      `oppsei-${rad.agent.id}`,
                    )
                  }
                  disabled={busy !== null}
                >
                  Si opp fra periodeslutt
                </button>
              )}
            </p>
          )}
        </section>
      ))}

      {/* Ikke et kort: dette er en opplysning, ikke noe man handler på.
          Men den skal stå — en kunde som tror de har satt i gang en trekk
          skal kunne lese seg til at de ikke har det. */}
      <p className="tiny muted" style={{ margin: "4px 2px 0" }}>
        Alle priser er eks. mva. Betaling er ikke koblet på ennå: å velge pakke
        registrerer avtalen, men det blir ikke sendt faktura og ingenting blir
        trukket.
        {partnerCode && (
          <>
            {" "}
            Registrert med partnerkode <strong>{partnerCode}</strong>.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Siste cellen i pakkeraden.
 *
 * Katalogen stopper ved den største pakken, men behovet gjør ikke det. Uten
 * dette kortet ser en kunde med mer volum bare tre pakker som ikke passer, og
 * regner ut at de skal betale overforbruk i det uendelige — eller finner en
 * annen leverandør. Lenken er billigere enn begge deler.
 */
function KontaktKort({ agent }: { agent: { id: string; name: string; unit: { ein: string; fleire: string } } }) {
  const tak = stoersteKvote(agent.id);
  const emne = encodeURIComponent(`Større pakke — ${agent.name}`);

  return (
    <div className="card card-pad plan plan-kontakt">
      <div className="row-between">
        <strong>Større behov</strong>
      </div>

      <div className="plan-price" style={{ fontSize: 22 }}>
        Egen avtale
      </div>
      <div className="tiny muted">etter volum</div>

      <ul className="plan-features">
        <li>
          Mer enn {tak} {agent.unit.fleire} i måneden
        </li>
        <li>Flere postkasser eller avdelinger</li>
        <li>Vi setter opp en pakke som passer</li>
      </ul>

      <a
        className="button secondary"
        style={{ width: "100%", justifyContent: "center", marginTop: 18 }}
        href={`mailto:${KONTAKT_EPOST}?subject=${emne}`}
      >
        Kontakt oss
      </a>
    </div>
  );
}

function Forbruk({ rad }: { rad: AgentRad }) {
  const kvote = rad.abonnement?.quota ?? 0;
  const andel = kvote > 0 ? Math.min(100, (rad.brukt / kvote) * 100) : 0;

  return (
    <div className="forbruk" style={{ marginTop: 16 }}>
      <div className="row-between tiny">
        <span>
          {rad.abonnement ? (
            <>
              <strong>{rad.brukt}</strong> av {kvote}{" "}
              {unitLabel(rad.agent, kvote)} brukt
            </>
          ) : (
            <>
              <strong>{rad.brukt}</strong> {unitLabel(rad.agent, rad.brukt)}{" "}
              generert denne perioden
            </>
          )}
        </span>
        <span className="muted">
          Perioden går til {kortDato(rad.periode.slutt)}
        </span>
      </div>

      {rad.abonnement && (
        <div
          className={`forbruk-bar${rad.overforbruk > 0 ? " over" : ""}`}
          role="presentation"
        >
          <div className="forbruk-fyll" style={{ width: `${andel}%` }} />
        </div>
      )}

      {rad.overforbruk > 0 && (
        <p className="tiny" style={{ marginTop: 8 }}>
          <strong>{rad.overforbruk}</strong> over taket ·{" "}
          {formatPrice(rad.overforbrukKr)} i tillegg denne perioden
        </p>
      )}
    </div>
  );
}

function kortDato(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}
