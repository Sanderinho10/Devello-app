import { AppShell } from "@/components/AppShell";

/**
 * Registrene: kontakter, timeregister, lager, leverandørfakturaer og
 * grossister. Hvert register er et eget punkt under «Register» i sidemenyen
 * (se components/Sidebar og ./faner), så sidene trenger ingen fanestripe.
 *
 * Ingen modulsjekk her: kontaktregisteret finnes både med og uten
 * ordremodulen. De andre hører til ordremodulen og sjekker det selv, på
 * siden — og API-et gjør den samme sjekken.
 */
export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
