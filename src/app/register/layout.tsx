import { AppShell } from "@/components/AppShell";
import { RegisterFaner } from "./RegisterFaner";
import { registerFaner } from "./faner";
import { selskapetsModular } from "@/app/selskap/innstillinger/moduler";

/**
 * Registrene: kontakter, leverandørfakturaer og grossister, med fanestripe
 * øverst. Sidemenyen har bare «Register»; fanene bor her.
 *
 * Ingen modulsjekk her: kontaktregisteret finnes både med og uten
 * ordremodulen. Leverandørfakturaer og grossister hører til ordremodulen og
 * sjekker det selv, på siden — og API-et gjør den samme sjekken.
 */
export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const moduler = await selskapetsModular();
  return (
    <AppShell>
      <RegisterFaner faner={registerFaner(moduler)} />
      {children}
    </AppShell>
  );
}
