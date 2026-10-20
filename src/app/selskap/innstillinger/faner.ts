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
 * Grossistane flytta til Register (/register/grossister) — dei er eit
 * register ein slår opp i, ikkje noko som blir sett opp éin gong.
 */
// Modulane står att i signaturen så kallarane slepp å endrast om ei fane
// igjen skal avhenge av ein modul.
export function innstillingsFaner(_moduler: string[]): InnstillingsFane[] {
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
  return faner;
}
