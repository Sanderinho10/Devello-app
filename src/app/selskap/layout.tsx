import { AppShell } from "@/components/AppShell";

/**
 * Selskap er åpent også uten aktivt abonnement, så man kan velge pakke.
 * Medlemmer og innstillinger sperrer selv (KrevAktivtAbonnement).
 */
export default function SelskapLayout({ children }: { children: React.ReactNode }) {
  return <AppShell aapen>{children}</AppShell>;
}
