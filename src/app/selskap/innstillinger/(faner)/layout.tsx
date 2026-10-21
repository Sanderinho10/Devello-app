import { InnstillingerMeny, InnstillingerTittel } from "./InnstillingerFaner";
import { innstillingsMeny } from "../faner";
import { selskapetsModular } from "../moduler";

/**
 * Selskap → Innstillinger, som i Go: menyen til venstre, punktet til høyre.
 * Hvert punkt har egen adresse, så en lenke kan peke rett på Regnskap eller
 * Postkasse — og OAuth-tilbakekallene lander der de hører hjemme.
 */
export default async function InnstillingerLayout({ children }: { children: React.ReactNode }) {
  const grupper = innstillingsMeny(await selskapetsModular());
  return (
    <>
      <div className="page-header kompakt">
        <div>
          <h1>Innstillinger</h1>
        </div>
      </div>
      <div className="inst-oppsett">
        <InnstillingerMeny grupper={grupper} />
        <div className="inst-innhold">
          <InnstillingerTittel grupper={grupper} />
          {children}
        </div>
      </div>
    </>
  );
}
