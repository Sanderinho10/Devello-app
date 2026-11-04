/**
 * Tidsrekninga i kalenderen: veker, dagar, overlapp og plassering side om side.
 *
 *   npm run test:kalender
 *
 * Krev ingen database. Køyrer i norsk tid, så sommartida blir testa òg.
 */
export {};
process.env.TZ = "Europe/Oslo";

const {
  bitPaaDag,
  fraSkjema,
  isoDato,
  klokke,
  leggTilDagar,
  mandag,
  overlappar,
  plasserSideOmSide,
  tidTekst,
  vekenummer,
} = await import("@/lib/kalender/tid");
const { lesHendingInput } = await import("@/lib/kalender/hent");

let feil = 0;
function sjekk(namn: string, faktisk: unknown, venta: unknown) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(venta);
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(56)} ${JSON.stringify(faktisk)}${ok ? "" : `   (venta ${JSON.stringify(venta)})`}`);
}

const t = (dato: string, kl = "00:00") => fraSkjema(dato, kl)!;

// Veker
sjekk("måndag i veka (onsdag)", isoDato(mandag(t("2026-11-04", "13:00"))), "2026-11-02");
sjekk("måndag i veka (søndag)", isoDato(mandag(t("2026-11-08"))), "2026-11-02");
sjekk("måndag i veka (måndag)", isoDato(mandag(t("2026-11-09", "10:00"))), "2026-11-09");
sjekk("vekenummer 4. nov 2026", vekenummer(t("2026-11-04")), 45);
sjekk("vekenummer 1. jan 2027 (veke 53)", vekenummer(t("2027-01-01")), 53);
sjekk("vekenummer 29. des 2025 (veke 1)", vekenummer(t("2025-12-29")), 1);

// Sommartid: å leggje til dagar held klokka fast.
sjekk("over sommartid (mars)", klokke(leggTilDagar(t("2026-03-28", "10:00"), 2)), "10:00");
sjekk("over vintertid (oktober)", isoDato(leggTilDagar(mandag(t("2026-10-25")), 7)), "2026-10-26");

// Skjema
sjekk("ugyldig dato", fraSkjema("2026-02-31", "10:00"), null);
sjekk("ugyldig klokke", fraSkjema("2026-02-03", "25:00"), null);
sjekk("dato + klokke", klokke(t("2026-11-09", "10:15")), "10:15");

// Overlapp
const rom = (a: string, b: string) => ({ start: t("2026-11-09", a), slutt: t("2026-11-09", b) });
sjekk("10–15 og 14–16 overlappar", overlappar(rom("10:00", "15:00"), rom("14:00", "16:00")), true);
sjekk("10–12 og 12–14 overlappar ikkje", overlappar(rom("10:00", "12:00"), rom("12:00", "14:00")), false);

// Bitar per dag
const fleirdagar = { id: "x", start: t("2026-11-09", "20:00"), slutt: t("2026-11-11", "08:00") };
const midten = bitPaaDag(fleirdagar, t("2026-11-10"));
sjekk("fleirdagars: midtdagen er heil", midten && [klokke(midten.fraKl), isoDato(midten.tilKl)], ["00:00", "2026-11-11"]);
sjekk("fleirdagars: siste dag til 08", bitPaaDag(fleirdagar, t("2026-11-11")) && klokke(bitPaaDag(fleirdagar, t("2026-11-11"))!.tilKl), "08:00");
sjekk("fleirdagars: dagen etter er tom", bitPaaDag(fleirdagar, t("2026-11-12")), null);

// Side om side
const bit = (id: string, a: string, b: string) => ({ id, fraKl: t("2026-11-09", a), tilKl: t("2026-11-09", b) });
const plass = plasserSideOmSide([bit("a", "10:00", "15:00"), bit("b", "11:00", "12:00"), bit("c", "12:00", "13:00"), bit("d", "16:00", "17:00")]);
sjekk("a i kolonne 0 av 2", plass.get("a"), { kolonne: 0, kolonnar: 2 });
sjekk("b i kolonne 1 av 2", plass.get("b"), { kolonne: 1, kolonnar: 2 });
sjekk("c gjenbruker kolonne 1", plass.get("c"), { kolonne: 1, kolonnar: 2 });
sjekk("d står aleine", plass.get("d"), { kolonne: 0, kolonnar: 1 });

// Tekst
sjekk("tidTekst same dag", tidTekst({ start: t("2026-11-09", "10:00"), slutt: t("2026-11-09", "15:00"), heileDagen: false }), "10:00–15:00");
sjekk("tidTekst heile dagen", tidTekst({ start: t("2026-11-09"), slutt: t("2026-11-10"), heileDagen: true }), "Hele dagen");

// Validering
const gyldig = {
  kind: "oppdrag",
  order_id: "o1",
  title: "",
  starts_at: t("2026-11-09", "10:00").toISOString(),
  ends_at: t("2026-11-09", "15:00").toISOString(),
  deltakarar: ["u1", "u1"],
};
const ok = lesHendingInput(gyldig);
sjekk("oppdrag: gyldig, deltakarar utan dublettar", "feil" in ok ? ok.feil : ok.deltakarar, ["u1"]);
sjekk("oppdrag utan ordre", lesHendingInput({ ...gyldig, order_id: null }), { feil: "Velg ordren oppdraget gjelder." });
sjekk("oppdrag utan montør", lesHendingInput({ ...gyldig, deltakarar: [] }), { feil: "Velg hvem som skal på oppdraget." });
sjekk("møte utan tittel", lesHendingInput({ ...gyldig, kind: "mote" }), { feil: "Skriv en tittel." });
sjekk("møte utan deltakarar er lov", "feil" in lesHendingInput({ ...gyldig, kind: "mote", title: "Mandagsmøte", deltakarar: [] }), false);
sjekk("møte slepp ordre", (lesHendingInput({ ...gyldig, kind: "mote", title: "M" }) as { order_id: string | null }).order_id, null);
sjekk("slutt før start", lesHendingInput({ ...gyldig, ends_at: gyldig.starts_at }), { feil: "Slutten må være etter starten." });
sjekk("ukjend type", lesHendingInput({ ...gyldig, kind: "fest" }), { feil: "Velg hva slags avtale det er." });

console.log(feil ? `\n${feil} feil` : "\nAlt ok");
process.exit(feil ? 1 : 0);
