import { AppShell } from "@/components/AppShell";

/**
 * Kunderegisteret står utenfor modulene: kunder finnes både med og uten
 * ordre-modulen, så ingen modulsjekk her.
 */
export default function KunderLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
