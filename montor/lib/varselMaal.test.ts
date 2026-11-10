import { lesPushData, varselMaal } from "./varselMaal";

describe("varselMaal", () => {
  it("nytt og endret oppdrag åpner ordren", () => {
    expect(varselMaal({ type: "nytt_oppdrag", order_id: "o1" })).toBe("/ordrer/o1/timer");
    expect(varselMaal({ type: "endra_oppdrag", order_id: "o1" })).toBe("/ordrer/o1/timer");
  });
  it("fjernet oppdrag, eller uten ordre, åpner programmet", () => {
    expect(varselMaal({ type: "fjerna_oppdrag", order_id: "o1" })).toBe("/");
    expect(varselMaal({ type: "nytt_oppdrag", order_id: null })).toBe("/");
    expect(varselMaal({})).toBe("/");
  });
});

describe("lesPushData", () => {
  it("leser feltene og tåler søppel", () => {
    expect(lesPushData({ type: "nytt_oppdrag", event_id: "e1", order_id: "o1", annet: 1 })).toEqual({ type: "nytt_oppdrag", event_id: "e1", order_id: "o1" });
    expect(lesPushData(null)).toEqual({ type: undefined, event_id: null, order_id: null });
    expect(lesPushData({ order_id: 42 })).toEqual({ type: undefined, event_id: null, order_id: null });
  });
});
