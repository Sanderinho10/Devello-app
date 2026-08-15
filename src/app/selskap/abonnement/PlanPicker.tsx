"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PLANS, findPlan, formatPrice, trialDaysLeft } from "@/lib/billing/plans";
import { formatDate } from "@/lib/types";

export function PlanPicker({
  plan,
  trialEndsAt,
  partnerCode,
  isAdmin,
}: {
  plan: string | null;
  trialEndsAt: string | null;
  partnerCode: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = findPlan(plan);
  const daysLeft = trialDaysLeft(trialEndsAt);

  async function choose(planId: string) {
    setBusy(planId);
    setError(null);
    try {
      const res = await fetch("/api/company/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
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

      {/* Status: prøveperiode eller valgt pakke */}
      {current ? (
        <div className="banner success">
          Dere står på <strong>{current.name}</strong> til{" "}
          {formatPrice(current.price)} per måned eks. mva.
          {daysLeft !== null && daysLeft > 0 && (
            <> Prøveperioden løper fortsatt, og varer til {formatDate(trialEndsAt)}.</>
          )}
        </div>
      ) : daysLeft !== null && daysLeft > 0 ? (
        <div className="banner info">
          <strong>
            {daysLeft} {daysLeft === 1 ? "dag" : "dager"} igjen
          </strong>{" "}
          av prøveperioden, som varer til {formatDate(trialEndsAt)}. Velg pakke når
          det passer — ingenting blir trukket automatisk.
        </div>
      ) : (
        <div className="banner warning">
          Prøveperioden er ute. Velg en pakke for å fortsette.
        </div>
      )}

      <div className="plan-grid">
        {PLANS.map((option) => {
          const chosen = option.id === plan;
          return (
            <div
              key={option.id}
              className={`card card-pad plan${chosen ? " chosen" : ""}${
                option.recommended && !chosen ? " recommended" : ""
              }`}
            >
              <div className="row-between">
                <strong>{option.name}</strong>
                {chosen ? (
                  <span className="pill bekrefta">Valgt</span>
                ) : (
                  option.recommended && <span className="pill ny">Anbefalt</span>
                )}
              </div>

              <div className="plan-price">
                {formatPrice(option.price)}
                <span className="plan-period"> / mnd</span>
              </div>
              <div className="tiny muted">eks. mva</div>

              <p className="muted" style={{ margin: "12px 0 14px" }}>
                {option.tagline}
              </p>

              <ul className="plan-features">
                {option.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              {isAdmin ? (
                <button
                  className={`button${chosen ? " secondary" : ""}`}
                  style={{ width: "100%", justifyContent: "center", marginTop: 18 }}
                  onClick={() => choose(option.id)}
                  disabled={busy !== null || chosen}
                >
                  {busy === option.id ? "Lagrer…" : chosen ? "Valgt" : "Velg denne"}
                </button>
              ) : (
                <p className="hint" style={{ marginTop: 18 }}>
                  Bare administratorer kan endre pakke.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="card card-pad">
        <strong>Betaling</strong>
        <p className="muted" style={{ marginTop: 6 }}>
          Betaling er ikke koblet på ennå. Å velge pakke registrerer valget, men
          det blir ikke sendt faktura og ingenting blir trukket. Vi tar kontakt om
          oppgjør før prøveperioden er ute.
        </p>

        {partnerCode && (
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Registrert med partnerkode <strong>{partnerCode}</strong>.
          </p>
        )}
      </div>
    </div>
  );
}
