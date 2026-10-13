import { InnstillingerFaner } from "./InnstillingerFaner";
import { innstillingsFaner } from "../faner";
import { selskapetsModular } from "../moduler";

/**
 * Sidene under Selskap → Innstillinger deler fanestripa; oversikta
 * (/selskap/innstillinger) ligg utanfor rutegruppa og har henne ikkje.
 * Kvar side har eiga adresse, så prisfila kan bokmerkast som før.
 */
export default async function InnstillingerFanerLayout({ children }: { children: React.ReactNode }) {
  const moduler = await selskapetsModular();
  return (
    <>
      <InnstillingerFaner faner={innstillingsFaner(moduler)} />
      {children}
    </>
  );
}
