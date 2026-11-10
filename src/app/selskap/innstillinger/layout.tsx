import { KrevAktivtAbonnement } from "@/components/AppShell";

/** Stengt uten aktivt abonnement, som resten av programmet. Bare Abonnement er åpent. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <KrevAktivtAbonnement>{children}</KrevAktivtAbonnement>;
}
