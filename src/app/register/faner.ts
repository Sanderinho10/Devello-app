import { harModul } from "@/lib/moduler";

export interface RegisterFane {
  label: string;
  href: string;
}

/**
 * Fanene under Register, i rekkefølge. Timeregister, biler og lager,
 * leverandørfakturaer og grossister
 * hører til ordremodulen og står bare når selskapet har den — samme bryter
 * som sidene og API-et sjekker.
 */
export function registerFaner(moduler: string[]): RegisterFane[] {
  const faner: RegisterFane[] = [{ label: "Kontakter", href: "/register/kontakter" }];
  if (harModul(moduler, "ordre")) {
    faner.push(
      { label: "Timeregister", href: "/register/timer" },
      { label: "Biler og lager", href: "/register/lager" },
      { label: "Leverandørfakturaer", href: "/register/leverandorfakturaer" },
      { label: "Grossister", href: "/register/grossister" },
    );
  }
  return faner;
}
