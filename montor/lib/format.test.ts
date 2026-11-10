import { dagTittel, dato, fraIsoDato, isoDato, kortNavn, kroner, lesTall, mengde, tall, tallFast, tid, tidsrom, timer } from "./format";

const naa = new Date(2026, 8, 28, 12, 0); // 28. sep 2026

describe("tall", () => {
  it("bruker komma og fjerner nuller", () => {
    expect(tall(12.5)).toBe("12,5");
    expect(tall(2)).toBe("2");
    expect(tall(2.5)).toBe("2,5");
    expect(tall(0.333, 2)).toBe("0,33");
  });
  it("tallFast har alltid desimaler", () => {
    expect(tallFast(12.4)).toBe("12,40");
    expect(tallFast(3)).toBe("3,00");
  });
  it("timer, kroner og mengde", () => {
    expect(timer(7.5)).toBe("7,5 t");
    expect(timer(1)).toBe("1 t");
    expect(kroner(12.4)).toBe("kr 12,40");
    expect(kroner(12.4, "m")).toBe("kr 12,40/m");
    expect(mengde(50, "m")).toBe("50 m");
    expect(mengde(1.5, "kg")).toBe("1,5 kg");
  });
  it("lesTall godtar komma og punktum", () => {
    expect(lesTall("7,5")).toBe(7.5);
    expect(lesTall("7.5")).toBe(7.5);
    expect(lesTall(" 1 000 ")).toBe(1000);
    expect(lesTall("")).toBeNull();
    expect(lesTall("abc")).toBeNull();
  });
});

describe("dato", () => {
  it("i dag og i går", () => {
    expect(dato("2026-09-28", naa)).toBe("i dag");
    expect(dato("2026-09-27", naa)).toBe("i går");
  });
  it("kort dato, med år når året er et annet", () => {
    expect(dato("2026-09-12", naa)).toBe("12. sep");
    expect(dato("2025-12-24", naa)).toBe("24. des 2025");
  });
  it("tidsstempel med klokkeslett", () => {
    const iso = new Date(2026, 8, 28, 14, 32).toISOString();
    expect(tid(iso, naa)).toBe("i dag 14:32");
    const iso2 = new Date(2026, 8, 12, 9, 5).toISOString();
    expect(tid(iso2, naa)).toBe("12. sep 09:05");
  });
  it("iso fram og tilbake, lokal tid", () => {
    expect(isoDato(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(fraIsoDato("2026-01-05")?.getDate()).toBe(5);
    expect(fraIsoDato("tull")).toBeNull();
  });
  it("tåler søppel", () => {
    expect(dato("ikke en dato", naa)).toBe("");
    expect(tid("", naa)).toBe("");
  });
});

describe("kortNavn", () => {
  it("forkorter etternavnet", () => {
    expect(kortNavn("Kari Nordmann")).toBe("Kari N.");
    expect(kortNavn("Ola")).toBe("Ola");
    expect(kortNavn("Per Arne Hansen")).toBe("Per H.");
  });
});

describe("program", () => {
  const naa = new Date(2026, 10, 9, 12, 0); // man. 9. nov 2026
  it("dagoverskrifter", () => {
    expect(dagTittel(new Date(2026, 10, 9), naa)).toBe("I dag");
    expect(dagTittel(new Date(2026, 10, 10), naa)).toBe("I morgen");
    expect(dagTittel(new Date(2026, 10, 11), naa)).toBe("ons. 11. nov");
    expect(dagTittel(new Date(2027, 0, 4), naa)).toBe("man. 4. jan 2027");
  });
  it("tidsrom samme dag, hele dagen og over flere dager", () => {
    const s = new Date(2026, 10, 9, 9, 0).toISOString();
    const e = new Date(2026, 10, 9, 14, 0).toISOString();
    expect(tidsrom(s, e, false, naa)).toBe("09:00–14:00");
    const m0 = new Date(2026, 10, 9, 0, 0).toISOString();
    const m1 = new Date(2026, 10, 10, 0, 0).toISOString();
    const m3 = new Date(2026, 10, 12, 0, 0).toISOString();
    expect(tidsrom(m0, m1, true, naa)).toBe("Hele dagen");
    expect(tidsrom(m0, m3, true, naa)).toBe("Hele dagen → ons. 11. nov");
    const e2 = new Date(2026, 10, 10, 14, 0).toISOString();
    expect(tidsrom(s, e2, false, naa)).toBe("09:00 → tir. 10. nov 14:00");
  });
});
