import type { Meg, OrdreIApp } from "../typer";
import { leggSvarIOrdre } from "./cache";
import type { UtboksRad } from "./typer";

const meg = { user: { id: "u1", full_name: "Kari Nordmann", email: "kari@star.no", role: "standard" }, company: { id: "c1", name: "Star", materials_markup_pct: 25 }, timetyper: [], api_version: 1 } as Meg;

const tom: OrdreIApp = {
  ordre: { id: "o1", status: "opna", updated_at: "2026-11-10T08:00:00Z" } as OrdreIApp["ordre"],
  timer: [],
  materiell: [],
  notat: [],
  bilete: [],
  lovlege_overgangar: ["paagaar", "avbrutt"],
};

const rad = (type: UtboksRad["type"]): UtboksRad => ({
  id: 1, client_id: "c-1", ordre_id: "o1", type, payload: "{}", fil_sti: null, avhengig_av: null, status: "sender",
  feil: null, forsok: 0, laga_kl: "2026-11-10T09:00:00Z", neste_forsok_kl: null, server_id: null, bruker_id: "u1",
});

describe("leggSvarIOrdre", () => {
  it("legger timen øverst med navnet til den innloggede", () => {
    const ut = leggSvarIOrdre(tom, rad("time"), { id: "t1", hours: 7.5, client_id: "c-1" }, meg);
    expect(ut.timer).toHaveLength(1);
    expect(ut.timer[0]).toMatchObject({ id: "t1", user_name: "Kari Nordmann" });
  });
  it("legger ikke inn samme rad to ganger", () => {
    const en = leggSvarIOrdre(tom, rad("time"), { id: "t1", hours: 7.5 }, meg);
    expect(leggSvarIOrdre(en, rad("time"), { id: "t1", hours: 7.5 }, meg).timer).toHaveLength(1);
  });
  it("materiell og notat", () => {
    expect(leggSvarIOrdre(tom, rad("materiell"), { id: "m1", name: "Kabel" }, meg).materiell[0]).toMatchObject({ id: "m1" });
    const n = leggSvarIOrdre(tom, rad("notat"), { id: "n1", text: "Hei" }, meg).notat[0];
    expect(n).toMatchObject({ id: "n1", user_name: "Kari Nordmann", bilete: [] });
  });
  it("bildet havner på notatet det hører til", () => {
    const medNotat = leggSvarIOrdre(tom, rad("notat"), { id: "n1", text: "Hei" }, meg);
    const ut = leggSvarIOrdre(medNotat, rad("bilete"), { id: "d1", title: "Skap", note_id: "n1", created_at: "2026-11-10T09:01:00Z" }, meg);
    expect(ut.bilete).toHaveLength(1);
    expect(ut.notat[0].bilete.map((b) => b.id)).toEqual(["d1"]);
  });
  it("status: ny status, og ingen overganger før ordren er hentet på nytt", () => {
    const ut = leggSvarIOrdre(tom, rad("status"), { id: "o1", status: "paagaar", updated_at: "2026-11-10T09:02:00Z" }, meg);
    expect(ut.ordre.status).toBe("paagaar");
    expect(ut.lovlege_overgangar).toEqual([]);
  });
  it("tåler svar uten innhold", () => {
    expect(leggSvarIOrdre(tom, rad("time"), null, meg)).toBe(tom);
    expect(leggSvarIOrdre(tom, rad("time"), {}, meg)).toBe(tom);
  });
});
