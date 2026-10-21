export interface InnstillingsFane {
  label: string;
  href: string;
  /** Éi setning om kva som ligg der. Står øvst på sida. */
  beskrivelse: string;
}

export interface InnstillingsGruppe {
  label: string;
  faner: InnstillingsFane[];
}

const BASE = "/selskap/innstillinger";

/**
 * Menyen til venstre under Selskap → Innstillinger, gruppert som i Go:
 * det som gjeld heile selskapet, tilbodsagenten, og ordremodulen (berre
 * når selskapet har han). Menyen og overskrifta på kvar side les same
 * liste, så dei kan ikkje sprike.
 */
export function innstillingsMeny(moduler: string[]): InnstillingsGruppe[] {
  const grupper: InnstillingsGruppe[] = [
    {
      label: "Selskap",
      faner: [
        {
          label: "Firma og profil",
          href: `${BASE}/firma`,
          beskrivelse: "Firmaopplysninger, adresse, og logoen, fargen og kontaktinfoen som står på tilbudene.",
        },
      ],
    },
    {
      label: "Tilbud",
      faner: [
        {
          label: "Postkasse",
          href: `${BASE}/postkasse`,
          beskrivelse: "Microsoft 365-postkassen leads hentes fra og svarene legges som kladd i.",
        },
        {
          label: "Tilbudsagent",
          href: `${BASE}/tilbudsagent`,
          beskrivelse: "Signatur, bunntekst, tilleggsinstruks og hvilken motor som lager utkastene.",
        },
        {
          label: "Prisfil",
          href: `${BASE}/prisfil`,
          beskrivelse: "Prislistene agenten slår opp i. Den regner aldri en pris selv.",
        },
        {
          label: "Referansefiler",
          href: `${BASE}/referansefiler`,
          beskrivelse: "Tidligere tilbud som agenten lærer tilbudstype og nivå fra.",
        },
      ],
    },
  ];
  if (moduler.includes("ordre")) {
    grupper.push({
      label: "Ordre",
      faner: [
        {
          label: "Materiell",
          href: `${BASE}/materiell`,
          beskrivelse: "Standardpåslaget som legges på grossistprisen når materiell føres på en ordre.",
        },
        {
          label: "Regnskap",
          href: `${BASE}/regnskap`,
          beskrivelse: "PowerOffice Go: leverandørfakturaer inn på ordren, og fakturaforslag tilbake som ordreutkast.",
        },
        {
          label: "Boligmappa",
          href: `${BASE}/boligmappa`,
          beskrivelse: "Ferdig dokumentasjon sendes til eiendommens Boligmappa med ett trykk fra ordren.",
        },
      ],
    });
  }
  return grupper;
}

/** Fana som gjeld for adressa: den lengste som passar (prisfil/[id] → Prisfil). */
export function aktivFane(grupper: InnstillingsGruppe[], pathname: string): InnstillingsFane | null {
  return (
    grupper
      .flatMap((g) => g.faner)
      .filter((f) => pathname === f.href || pathname.startsWith(f.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}
