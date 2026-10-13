import { harModul } from "@/lib/moduler";

export interface InnstillingsFane {
  label: string;
  href: string;
  /** Éi setning om kva som ligg der. Brukt på oversikta. */
  beskrivelse: string;
}

/**
 * Det som ligg under Selskap → Innstillinger, i rekkjefølgje.
 *
 * Oversikta og fanestripa les same liste, så dei kan ikkje sprike.
 * Grossister høyrer til ordremodulen og står berre når selskapet har han —
 * same brytar som API-et og /ordre-sidene sjekkar.
 */
export function innstillingsFaner(moduler: string[]): InnstillingsFane[] {
  const faner: InnstillingsFane[] = [
    {
      label: "Innstillinger",
      href: "/selskap/innstillinger/generelt",
      beskrivelse:
        "Firmaopplysninger og profil, postkassen og teksten i tilbudene, og påslag, regnskap og Boligmappa for ordre.",
    },
    {
      label: "Prisfil",
      href: "/selskap/innstillinger/prisfil",
      beskrivelse: "Prisradene agenten slår opp i når den lager tilbud og regner på ordrer.",
    },
    {
      label: "Referansefiler",
      href: "/selskap/innstillinger/referansefiler",
      beskrivelse: "Tidligere tilbud som agenten lærer tilbudstype og nivå fra.",
    },
  ];
  if (harModul(moduler, "ordre")) {
    faner.push({
      label: "Grossister",
      href: "/selskap/innstillinger/grossister",
      beskrivelse: "Grossistene dere handler hos, katalogene deres og hvordan de holdes oppdatert.",
    });
  }
  return faner;
}
