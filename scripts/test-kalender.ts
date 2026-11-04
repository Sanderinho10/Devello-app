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
const { kvenSkalVarslast, naarTekst, varselTekst } = await import("@/lib/kalender/varsel");
const { osloDag, osloDato, datoarMellom } = await import("@/lib/kalender/oslo");
const { lagTimeforslag } = await import("@/lib/kalender/timeforslag");

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

// Varsel: kven får kva
const no = new Date("2026-11-04T12:00:00Z");
const v = (over: Record<string, unknown> = {}) => ({
  kind: "oppdrag" as const,
  order_id: "o1",
  order_no: 1001,
  title: "Nytt sikringsskap",
  location: null,
  site_address: "Storgata 12",
  starts_at: "2026-11-09T09:00:00Z",
  ends_at: "2026-11-09T14:00:00Z",
  all_day: false,
  deltakarar: ["noah"],
  ...over,
});
sjekk("nytt oppdrag → montøren", kvenSkalVarslast(null, v(), "sjef", no), [{ userId: "noah", kind: "nytt_oppdrag" }]);
sjekk("sjefen varslar ikkje seg sjølv", kvenSkalVarslast(null, v({ deltakarar: ["sjef"] }), "sjef", no), []);
sjekk("fravær blir ikkje varsla", kvenSkalVarslast(null, v({ kind: "fravaer" }), "sjef", no), []);
sjekk("avtale i fortida blir ikkje varsla", kvenSkalVarslast(null, v({ starts_at: "2026-11-01T09:00:00Z", ends_at: "2026-11-01T14:00:00Z" }), "sjef", no), []);
sjekk("heile firmaet blir ikkje varsla", kvenSkalVarslast(null, v({ kind: "mote", deltakarar: [] }), "sjef", no), []);
sjekk("flytta tid → endra", kvenSkalVarslast(v(), v({ starts_at: "2026-11-10T09:00:00Z", ends_at: "2026-11-10T14:00:00Z" }), "sjef", no), [{ userId: "noah", kind: "endra_oppdrag" }]);
sjekk("berre ny tittel → ingen varsel", kvenSkalVarslast(v(), v({ title: "Anna" }), "sjef", no), []);
sjekk("bytt montør → ny og fjerna", kvenSkalVarslast(v(), v({ deltakarar: ["emma"] }), "sjef", no), [
  { userId: "emma", kind: "nytt_oppdrag" },
  { userId: "noah", kind: "fjerna_oppdrag" },
]);
sjekk("sletta → fjerna", kvenSkalVarslast(v(), null, "sjef", no), [{ userId: "noah", kind: "fjerna_oppdrag" }]);
sjekk("naarTekst i norsk tid", naarTekst(v()), "man. 9. nov. 10:00–15:00");
sjekk("varseltekst nytt oppdrag", varselTekst("nytt_oppdrag", v()), {
  title: "Nytt oppdrag: #1001 Nytt sikringsskap",
  body: "man. 9. nov. 10:00–15:00 · Storgata 12",
});

// Norsk tid på ein tenar i UTC (prosessen køyrer i Oslo-tid, men osloDag skal ikkje bry seg)
sjekk("osloDag vinter startar 23:00 UTC", osloDag("2026-11-09").start.toISOString(), "2026-11-08T23:00:00.000Z");
sjekk("osloDag sommar startar 22:00 UTC", osloDag("2026-07-01").start.toISOString(), "2026-06-30T22:00:00.000Z");
sjekk("osloDag skiftedag (25. okt) er 25 t", (osloDag("2026-10-25").slutt.getTime() - osloDag("2026-10-25").start.getTime()) / 3_600_000, 25);
sjekk("osloDato 23:30 UTC er neste dag", osloDato(new Date("2026-11-08T23:30:00Z")), "2026-11-09");
sjekk("datoarMellom", datoarMellom("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);

// Timeforslag
const dagar = ["2026-11-09", "2026-11-10"].map((dato) => ({ dato, ...osloDag(dato) }));
const opp = (id: string, fra: string, til: string, del = ["noah"], over: Record<string, unknown> = {}) => ({
  id, kind: "oppdrag", all_day: false, starts_at: fra, ends_at: til, order_id: "o1", deltakarar: del, ...over,
});
const etterpaa = new Date("2026-11-11T12:00:00Z");
const tf = lagTimeforslag({ oppdrag: [opp("a", "2026-11-09T09:00:00Z", "2026-11-09T14:00:00Z")], foert: [], dagar, no: etterpaa });
sjekk("10–15 gir 5 t", tf.map((f) => [f.user_id, f.work_date, f.timar]), [["noah", "2026-11-09", 5]]);
sjekk("to montørar gir to forslag", lagTimeforslag({ oppdrag: [opp("a", "2026-11-09T09:00:00Z", "2026-11-09T14:00:00Z", ["noah", "emma"])], foert: [], dagar, no: etterpaa }).length, 2);
sjekk("to oppdrag same dag blir lagde saman", lagTimeforslag({ oppdrag: [opp("a", "2026-11-09T07:00:00Z", "2026-11-09T09:00:00Z"), opp("b", "2026-11-09T11:00:00Z", "2026-11-09T13:30:00Z")], foert: [], dagar, no: etterpaa }).map((f) => f.timar), [4.5]);
sjekk("ført noko → ikkje forslag", lagTimeforslag({ oppdrag: [opp("a", "2026-11-09T09:00:00Z", "2026-11-09T14:00:00Z")], foert: [{ order_id: "o1", user_id: "noah", work_date: "2026-11-09", hours: 4 }], dagar, no: etterpaa }), []);
sjekk("ikkje starta → ikkje forslag", lagTimeforslag({ oppdrag: [opp("a", "2026-11-09T09:00:00Z", "2026-11-09T14:00:00Z")], foert: [], dagar, no: new Date("2026-11-09T08:00:00Z") }), []);
sjekk("møte gir ikkje forslag", lagTimeforslag({ oppdrag: [opp("a", "2026-11-09T09:00:00Z", "2026-11-09T14:00:00Z", ["noah"], { kind: "mote" })], foert: [], dagar, no: etterpaa }), []);
sjekk("over midnatt blir delt per dag", lagTimeforslag({ oppdrag: [opp("a", "2026-11-09T21:00:00Z", "2026-11-10T01:00:00Z")], foert: [], dagar, no: etterpaa }).map((f) => [f.work_date, f.timar]), [["2026-11-10", 2], ["2026-11-09", 2]]);
sjekk("rundar til kvarter", lagTimeforslag({ oppdrag: [opp("a", "2026-11-09T09:00:00Z", "2026-11-09T11:10:00Z")], foert: [], dagar, no: etterpaa })[0].timar, 2.25);

console.log(feil ? `\n${feil} feil` : "\nAlt ok");
process.exit(feil ? 1 : 0);
