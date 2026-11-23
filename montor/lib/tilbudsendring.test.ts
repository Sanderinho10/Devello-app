import { endringsNotat } from "./tilbudsendring";

const linje = (description: string, quantity: number, ny: number, unit = "stk") => ({ description, quantity, ny, unit });

describe("endringsNotat", () => {
  it("gir null når ingenting er endret og kommentaren er tom", () => {
    expect(endringsNotat([linje("Stikkontakt", 4, 4)], "  ")).toBeNull();
  });

  it("lister bare linjene som er endret, med fra og til", () => {
    const tekst = endringsNotat([linje("Stikkontakt dobbel", 4, 6), linje("Downlight", 8, 8), linje("Kabel PR 3G2,5", 25, 32.5, "m")], "");
    expect(tekst).toBe("Endringer fra tilbudet:\n– Stikkontakt dobbel: 4 → 6 stk\n– Kabel PR 3G2,5: 25 → 32,5 m");
  });

  it("merker en linje som utgår", () => {
    expect(endringsNotat([linje("Downlight", 8, 0)], "")).toContain("– Downlight: 8 → 0 stk (utgår)");
  });

  it("tar kommentaren med, også alene", () => {
    expect(endringsNotat([linje("Stikkontakt", 4, 5)], " Avtalt med kunden ")).toBe("Endringer fra tilbudet:\n– Stikkontakt: 4 → 5 stk\nKommentar: Avtalt med kunden");
    expect(endringsNotat([linje("Stikkontakt", 4, 4)], "To ekstra stikk på kjøkkenet")).toBe("Endringer fra tilbudet:\nTo ekstra stikk på kjøkkenet");
  });

  it("ser bort fra ugyldige antall", () => {
    expect(endringsNotat([linje("Stikkontakt", 4, Number.NaN), linje("Bryter", 2, -1)], "")).toBeNull();
  });
});
