import { AppShell } from "@/components/AppShell";

/**
 * Registrene: kontakter, leverandørfakturaer og grossister.
 *
 * Ingen modulsjekk her: kontaktregisteret finnes både med og uten
 * ordremodulen. Leverandørfakturaer og grossister hører til ordremodulen og
 * sjekker det selv, på siden — og API-et gjør den samme sjekken.
 */
export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
