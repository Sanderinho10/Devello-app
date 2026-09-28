import { backoffSekund, handterSvar, planleggNeste } from "./planlegg";
import type { UtboksRad } from "./typer";

const no = new Date("2026-09-28T10:00:00.000Z");

let neste = 1;
function rad(deler: Partial<UtboksRad> = {}): UtboksRad {
  const id = neste++;
  return {
    id,
    client_id: `c${id}`,
    ordre_id: "o1",
    type: "time",
    payload: "{}",
    fil_sti: null,
    avhengig_av: null,
    status: "venter",
    feil: null,
    forsok: 0,
    laga_kl: new Date(no.getTime() - 60_000 + id * 1000).toISOString(),
    neste_forsok_kl: null,
    server_id: null,
    ...deler,
  };
}

beforeEach(() => {
  neste = 1;
});

describe("planleggNeste — rekkefølge", () => {
  it("tar den eldste ventende først, uansett rekkefølge i lista", () => {
    const a = rad({ laga_kl: "2026-09-28T09:00:03.000Z" });
    const b = rad({ laga_kl: "2026-09-28T09:00:01.000Z" });
    const c = rad({ laga_kl: "2026-09-28T09:00:02.000Z" });
    expect(planleggNeste([a, b, c], no).rad).toBe(b);
  });
  it("hopper over rader som sender eller har feilet", () => {
    const a = rad({ status: "sender" });
    const b = rad({ status: "feil" });
    const c = rad();
    expect(planleggNeste([a, b, c], no).rad).toBe(c);
  });
  it("ingen rader → ingenting å vente på", () => {
    expect(planleggNeste([], no)).toEqual({ rad: null, ventMs: null });
    expect(planleggNeste([rad({ status: "feil" })], no)).toEqual({ rad: null, ventMs: null });
  });
});

describe("planleggNeste — notat før bilde", () => {
  it("sender notatet før bildet som hører til det", () => {
    const notat = rad({ type: "notat", client_id: "n1" });
    const bilde = rad({ type: "bilete", avhengig_av: "n1" });
    expect(planleggNeste([bilde, notat], no).rad).toBe(notat);
  });
  it("bildet venter mens notatet har feilet, men sperrer ikke andre", () => {
    const notat = rad({ type: "notat", client_id: "n1", status: "feil" });
    const bilde = rad({ type: "bilete", avhengig_av: "n1" });
    const time = rad({ type: "time" });
    expect(planleggNeste([notat, bilde, time], no)).toEqual({ rad: time, ventMs: null });
    expect(planleggNeste([notat, bilde], no)).toEqual({ rad: null, ventMs: null });
  });
  it("bildet går når notatet er sendt (borte fra utboksen eller har server_id)", () => {
    const bilde = rad({ type: "bilete", avhengig_av: "n1" });
    expect(planleggNeste([bilde], no).rad).toBe(bilde);
    const notat = rad({ type: "notat", client_id: "n1", status: "sender", server_id: "srv" });
    expect(planleggNeste([notat, bilde], no).rad).toBe(bilde);
  });
});

describe("planleggNeste — backoff", () => {
  it("hopper over rad i backoff og sier hvor lenge det er til", () => {
    const a = rad({ neste_forsok_kl: new Date(no.getTime() + 4000).toISOString() });
    expect(planleggNeste([a], no)).toEqual({ rad: null, ventMs: 4000 });
  });
  it("rad i backoff sperrer ikke den bak", () => {
    const a = rad({ neste_forsok_kl: new Date(no.getTime() + 4000).toISOString() });
    const b = rad();
    expect(planleggNeste([a, b], no)).toEqual({ rad: b, ventMs: null });
  });
  it("utgått backoff er klar", () => {
    const a = rad({ neste_forsok_kl: new Date(no.getTime() - 1).toISOString() });
    expect(planleggNeste([a], no).rad).toBe(a);
  });
  it("korteste ventetid vinner", () => {
    const a = rad({ neste_forsok_kl: new Date(no.getTime() + 9000).toISOString() });
    const b = rad({ neste_forsok_kl: new Date(no.getTime() + 2000).toISOString() });
    expect(planleggNeste([a, b], no).ventMs).toBe(2000);
  });
});

describe("backoffSekund", () => {
  it("dobler og stopper på fem minutter", () => {
    expect(backoffSekund(1)).toBe(2);
    expect(backoffSekund(2)).toBe(4);
    expect(backoffSekund(5)).toBe(32);
    expect(backoffSekund(9)).toBe(300);
    expect(backoffSekund(20)).toBe(300);
  });
});

describe("handterSvar", () => {
  it("200 og 201 er ferdig", () => {
    expect(handterSvar(rad(), { slag: "http", status: 201, melding: null, server_id: "s1" }, no)).toEqual({
      handling: "ferdig",
      server_id: "s1",
    });
    expect(handterSvar(rad(), { slag: "http", status: 200, melding: null, server_id: "s1" }, no).handling).toBe("ferdig");
  });
  it("4xx stopper med serverens melding", () => {
    for (const status of [400, 403, 404]) {
      expect(handterSvar(rad(), { slag: "http", status, melding: "Ordren er avsluttet.", server_id: null }, no)).toEqual({
        handling: "feil",
        feil: "Ordren er avsluttet.",
      });
    }
    expect(handterSvar(rad(), { slag: "http", status: 400, melding: null, server_id: null }, no)).toEqual({
      handling: "feil",
      feil: "Serveren svarte 400.",
    });
  });
  it("401 ber om nytt token", () => {
    expect(handterSvar(rad(), { slag: "http", status: 401, melding: "Ikke innlogget", server_id: null }, no)).toEqual({
      handling: "refresh",
    });
  });
  it("5xx, 429 og nettfeil prøver igjen med backoff", () => {
    const r = rad({ forsok: 0 });
    const v = handterSvar(r, { slag: "http", status: 503, melding: "Nede", server_id: null }, no);
    expect(v).toEqual({
      handling: "venter",
      forsok: 1,
      neste_forsok_kl: new Date(no.getTime() + 2000).toISOString(),
      feil: "Nede",
    });
    const v2 = handterSvar(rad({ forsok: 3 }), { slag: "http", status: 429, melding: null, server_id: null }, no);
    expect(v2).toMatchObject({ handling: "venter", forsok: 4, neste_forsok_kl: new Date(no.getTime() + 16_000).toISOString() });
    const v3 = handterSvar(rad({ forsok: 10 }), { slag: "nett" }, no);
    expect(v3).toMatchObject({ handling: "venter", forsok: 11, neste_forsok_kl: new Date(no.getTime() + 300_000).toISOString(), feil: "Ingen dekning" });
  });
});
