import Link from "next/link";
import { innstillingsFaner } from "./faner";
import { selskapetsModular } from "./moduler";

export const dynamic = "force-dynamic";

/**
 * Inngangen til oppsettet: eitt kort per del, så ein ser kva som finst før
 * ein går inn. Sidene under har fanestripa, så ein kan hoppe mellom dei
 * utan å gå hit att.
 */
export default async function InnstillingerOversikt() {
  const moduler = await selskapetsModular();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Innstillinger</h1>
          <p className="page-subtitle">
            Oppsettet for selskapet og agentene. Det som settes opp én gang og
            justeres sjelden.
          </p>
        </div>
      </div>

      <div className="innstillinger-grid">
        {innstillingsFaner(moduler).map((fane) => (
          <Link key={fane.href} href={fane.href} className="card innstillinger-kort">
            <strong>{fane.label}</strong>
            <span className="muted">{fane.beskrivelse}</span>
            <span className="innstillinger-pil" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
