#!/usr/bin/env node
/**
 * Liksom-server for montørappen: Supabase Auth og API-et fra docs/api.md i
 * én prosess, med data i minnet. Til forhåndsvisning og testing uten
 * nettappen:
 *
 *   node dev/liksom-server.mjs            (port 4010)
 *   EXPO_PUBLIC_SUPABASE_URL=http://localhost:4010 \
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=liksom \
 *   EXPO_PUBLIC_API_URL=http://localhost:4010 npx expo start --web
 *
 * Alle e-poster slipper inn; passordet «feil» gir feil passord, og e-posten
 * utenmodul@… gir et selskap uten ordre-modul. POST /__liksom {feil, forsinking}
 * får skrive-kallene til å svare med en feilkode eller tregt.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 4010);
const DAG = 24 * 60 * 60 * 1000;
const naa = () => new Date().toISOString();
const dato = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const kl = (dagar, time, min = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dagar);
  d.setHours(time, min, 0, 0);
  return d;
};

const SELSKAP = { id: "c0000000-0000-4000-8000-000000000001", name: "Star Elektro AS", materials_markup_pct: 25 };
const MEG = { id: "u0000000-0000-4000-8000-000000000001", full_name: "Sander Solheim", email: "sander@star.no", role: "admin" };
const NOAH = { id: "u0000000-0000-4000-8000-000000000002", full_name: "Noah Berg" };
const TIMETYPER = [
  { id: "t0000000-0000-4000-8000-000000000001", name: "Timepris elektriker", unit_price: 895 },
  { id: "t0000000-0000-4000-8000-000000000002", name: "Lærling", unit_price: 495 },
  { id: "t0000000-0000-4000-8000-000000000003", name: "Overtid 50 %", unit_price: 1342.5 },
];
const OVERGANGER = { opna: ["paagaar", "avbrutt"], paagaar: ["ferdig", "opna", "avbrutt"], ferdig: ["paagaar", "avbrutt"], fakturert: [], avbrutt: ["opna"] };

let ordreNr = 1040;
const ordre = (status, title, kunde, tlf, adr) => ({
  id: randomUUID(), company_id: SELSKAP.id, order_no: ++ordreNr, status, title, description: null, description_source: null,
  customer_name: kunde, customer_contact: null, customer_email: null, customer_phone: tlf, site_address: adr,
  lead_id: null, draft_id: null, quote_type: null, planned_total: null, boligmappa_number: null, boligmappa_property: null,
  created_by: MEG.id, created_at: naa(), updated_at: naa(), closed_at: null,
});
const ORDRAR = [
  ordre("paagaar", "Nytt sikringsskap", "Kari Nordmann", "900 12 345", "Storgata 12, 5003 Bergen"),
  ordre("paagaar", "Elbillader i garasje", "Borettslaget Fjellveien", "55 31 00 00", "Fjellveien 48, 5019 Bergen"),
  ordre("opna", "Bytte stikkontakter kjøkken", "Ola Hansen", "412 34 567", "Nygårdsgaten 5, 5015 Bergen"),
  ordre("opna", "Feilsøking jordfeil", "Bergen Bakeri AS", "55 90 12 00", "Strandgaten 77, 5004 Bergen"),
  ordre("opna", "Utelys og bevegelsessensor", "Ingrid Larsen", null, "Kalfarveien 21, 5018 Bergen"),
  ordre("ferdig", "Varmekabler bad", "Per Olsen", "930 00 111", "Welhavens gate 9, 5006 Bergen"),
];
const TIMER = [];
const MATERIELL = [];
const NOTAT = [];
const DOKUMENT = [];

const time = (o, bruker, dagar, timer, type, note) => TIMER.push({
  id: randomUUID(), company_id: SELSKAP.id, order_id: o.id, user_id: bruker.id, work_date: dato(kl(dagar, 12)),
  price_item_id: type.id, time_type_name: type.name, unit_price: type.unit_price, hours: timer, note, billable: true,
  created_by: bruker.id, created_at: kl(dagar, 16).toISOString(), updated_at: kl(dagar, 16).toISOString(), invoice_draft_id: null, client_id: null,
});
time(ORDRAR[0], MEG, -1, 7.5, TIMETYPER[0], "Demontert gammelt skap, montert nytt");
time(ORDRAR[0], NOAH, -1, 7.5, TIMETYPER[1], null);
time(ORDRAR[0], MEG, -2, 4, TIMETYPER[0], "Befaring og bestilling");
time(ORDRAR[1], MEG, -3, 5, TIMETYPER[0], "Trekking av kabel");

const KATALOG = [
  ["1000270", "7020160123456", "PFXP-EX 500V 3G1,5MM²", "m", 123.3, 18.06],
  ["1000274", "7020160123463", "PFXP-EX 500V 3G2,5MM²", "m", 168.9, 26.4],
  ["1405062", "7045210001234", "ELKO RS16 STIKK 2-V JORDET PH", "stk", 189, 98.5],
  ["1405070", "7045210001241", "ELKO RS16 DOBBEL STIKK ZE 225", "stk", 249, 131.2],
  ["1210408", "7332747012345", "EL.BOKS ISFRI70", "stk", 64, 28.9],
  ["1210001", "7332747000014", "ELMA 43 VEGGBOKS", "stk", 39.5, 17.8],
  ["1600504", "4011395112342", "JORDFEILAUTOMAT 16A C 30MA 2P", "stk", 890, 412],
  ["1601020", "4011395120019", "AUTOMATSIKRING 16A B 2P", "stk", 240, 96],
  ["3200115", "7391649001122", "LED DOWNLIGHT 7W 3000K IP44", "stk", 329, null],
  ["4100220", "7020160200010", "VARMEKABEL 17W/M 600W 35M", "stk", 2890, 1620],
].map(([item_no, gtin, name, unit, list, net]) => ({
  id: randomUUID(), supplier_id: "s0000000-0000-4000-8000-000000000001", supplier_name: "Onninen",
  item_no, gtin, name, unit, list_price_per_unit: list, net_price_per_unit: net,
}));

MATERIELL.push(
  { id: randomUUID(), company_id: SELSKAP.id, order_id: ORDRAR[0].id, source: "manuell", supplier_item_id: KATALOG[6].id, item_no: KATALOG[6].item_no, name: KATALOG[6].name, unit: "stk", quantity: 4, cost_price: 412, markup_pct: 25, sale_price: 515, note: null, billable: true, registered_by: MEG.id, registered_at: kl(-1, 15).toISOString(), updated_at: kl(-1, 15).toISOString(), invoice_line_id: null, replaced_by: null, invoice_draft_id: null, client_id: null },
  { id: randomUUID(), company_id: SELSKAP.id, order_id: ORDRAR[0].id, source: "faktura", supplier_item_id: null, item_no: "1601020", name: "AUTOMATSIKRING 16A B 2P", unit: "stk", quantity: 12, cost_price: 96, markup_pct: 25, sale_price: 120, note: null, billable: true, registered_by: null, registered_at: kl(-2, 9).toISOString(), updated_at: kl(-2, 9).toISOString(), invoice_line_id: randomUUID(), replaced_by: null, invoice_draft_id: null, client_id: null },
  { id: randomUUID(), company_id: SELSKAP.id, order_id: ORDRAR[0].id, source: "manuell", supplier_item_id: KATALOG[0].id, item_no: KATALOG[0].item_no, name: KATALOG[0].name, unit: "m", quantity: 50, cost_price: 18.06, markup_pct: 25, sale_price: 22.58, note: null, billable: true, registered_by: NOAH.id, registered_at: kl(-2, 14).toISOString(), updated_at: kl(-2, 14).toISOString(), invoice_line_id: null, replaced_by: null, invoice_draft_id: null, client_id: null },
);
NOTAT.push(
  { id: randomUUID(), company_id: SELSKAP.id, order_id: ORDRAR[0].id, user_id: NOAH.id, text: "Gammelt skap hadde skrusikringer. Tok bilde før riving. Hovedbryter må byttes, avklart med kunde.", client_id: null, created_at: kl(-2, 10).toISOString(), updated_at: kl(-2, 10).toISOString() },
);
DOKUMENT.push({ id: randomUUID(), order_id: ORDRAR[0].id, kind: "fil", title: "Skap før riving", file_name: "skap.jpg", mime_type: "image/jpeg", note_id: NOTAT[0].id, created_at: kl(-2, 10).toISOString(), client_id: null });

const kOrdre = (o) => ({ id: o.id, order_no: o.order_no, title: o.title, customer_name: o.customer_name, site_address: o.site_address, status: o.status });
const hending = (kind, order, title, start, slutt, deltakarar, ekstra = {}) => ({
  id: randomUUID(), kind, title: title || order?.title || "Uten tittel", egen_tittel: title ?? "", description: null, location: null,
  starts_at: start.toISOString(), ends_at: slutt.toISOString(), all_day: false, order: order ? kOrdre(order) : null,
  deltakarar: deltakarar.map((d) => ({ id: d.id, navn: d.full_name })), ...ekstra,
});
const midnatt = (dagar) => kl(dagar, 0);
const KALENDER = () => [
  hending("oppdrag", ORDRAR[0], "", kl(0, 8), kl(0, 12), [MEG, NOAH], { description: "Nøkkel i postkassen" }),
  hending("mote", null, "Mandagsmøte", kl(0, 12, 30), kl(0, 13), [MEG, NOAH], { location: "Kontoret" }),
  hending("oppdrag", ORDRAR[1], "", kl(0, 13), kl(0, 15, 30), [MEG]),
  hending("oppdrag", ORDRAR[2], "", kl(1, 8), kl(1, 11), [MEG]),
  hending("oppdrag", ORDRAR[3], "", kl(1, 12), kl(1, 15), [NOAH]),
  hending("annet", null, "Hente varer hos Onninen", kl(2, 7, 30), kl(2, 8, 30), [MEG], { location: "Onninen Bergen, Kokstadflaten 4" }),
  hending("oppdrag", ORDRAR[4], "", kl(3, 9), kl(3, 14), [MEG, NOAH]),
  hending("fravaer", null, "Ferie", midnatt(6), midnatt(9), [MEG], { all_day: true }),
];

const varsel = (kind, o, title, body, timarSidan, lest) => ({
  id: randomUUID(), kind, title, body, event_id: kind === "fjerna_oppdrag" ? null : randomUUID(), order_id: o.id,
  read_at: lest ? new Date(Date.now() - 30 * 60 * 1000).toISOString() : null, created_at: new Date(Date.now() - timarSidan * 60 * 60 * 1000).toISOString(),
});
const VARSEL = [
  varsel("nytt_oppdrag", ORDRAR[2], `Nytt oppdrag: #${ORDRAR[2].order_no} ${ORDRAR[2].title}`, "ons. 11. nov. 08:00–11:00 · Nygårdsgaten 5, 5015 Bergen", 1, false),
  varsel("endra_oppdrag", ORDRAR[1], `Endret oppdrag: #${ORDRAR[1].order_no} ${ORDRAR[1].title}`, "tir. 10. nov. 13:00–15:30 · Fjellveien 48, 5019 Bergen", 3, false),
  varsel("fjerna_oppdrag", ORDRAR[5], `Du er tatt av oppdraget: #${ORDRAR[5].order_no} ${ORDRAR[5].title}`, "man. 9. nov. 09:00–12:00 · Welhavens gate 9, 5006 Bergen", 26, true),
];
const PUSH_TOKEN = new Set();

const modus = { feil: null, forsinking: 0 };

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function les(req) {
  return new Promise((resolve) => {
    const deler = [];
    req.on("data", (d) => deler.push(d));
    req.on("end", () => resolve(Buffer.concat(deler)));
  });
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sesjon(email) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const bruker = { id: MEG.id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: naa() };
  return {
    access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: MEG.id, email, exp, role: "authenticated" })}.liksom`,
    token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: `r-${email}`, user: bruker,
  };
}
function epostFra(req) {
  const m = /^Bearer\s+[^.]+\.([^.]+)\./.exec(req.headers.authorization ?? "");
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m[1], "base64url").toString()).email ?? null;
  } catch {
    return null;
  }
}

function ordreForApp(o) {
  const namn = (id) => (id === MEG.id ? MEG.full_name : id === NOAH.id ? NOAH.full_name : "");
  const bilete = DOKUMENT.filter((d) => d.order_id === o.id).map((d) => ({ id: d.id, title: d.title, file_name: d.file_name, created_at: d.created_at, note_id: d.note_id }));
  return {
    ordre: o,
    timer: TIMER.filter((t) => t.order_id === o.id).sort((a, b) => (a.work_date < b.work_date ? 1 : a.work_date > b.work_date ? -1 : a.created_at < b.created_at ? 1 : -1)).map((t) => ({ ...t, user_name: namn(t.user_id) })),
    materiell: MATERIELL.filter((m) => m.order_id === o.id).sort((a, b) => (a.registered_at < b.registered_at ? 1 : -1)),
    notat: NOTAT.filter((n) => n.order_id === o.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((n) => ({ ...n, user_name: namn(n.user_id), bilete: bilete.filter((b) => b.note_id === n.id) })),
    bilete,
    lovlege_overgangar: OVERGANGER[o.status],
  };
}

const BILDE = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#c7ccd4"/><rect x="250" y="120" width="300" height="360" rx="8" fill="#8e96a3"/><rect x="280" y="160" width="240" height="60" fill="#5b6470"/><g fill="#e8eaee"><rect x="290" y="250" width="40" height="80"/><rect x="345" y="250" width="40" height="80"/><rect x="400" y="250" width="40" height="80"/><rect x="455" y="250" width="40" height="80"/></g></svg>`,
);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const sti = url.pathname;
  const m = req.method;
  if (m === "OPTIONS") return json(res, 204, {});
  const kropp = await les(req);
  let body = {};
  try {
    body = kropp.length && (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(kropp.toString()) : {};
  } catch {
    body = {};
  }
  const skriving = m !== "GET" && sti.startsWith("/api/");
  if (modus.forsinking) await new Promise((r) => setTimeout(r, modus.forsinking));
  console.log(m, sti + url.search, skriving && modus.feil ? `→ ${modus.feil} (liksom-feil)` : "");

  // --- styring -------------------------------------------------------------
  if (sti === "/__liksom") {
    if (m === "POST") {
      // {"nyttVarsel": true} legger til et ulest varsel, resten er modus.
      const { nyttVarsel, ...rest } = body;
      if (nyttVarsel) VARSEL.unshift(varsel("nytt_oppdrag", ORDRAR[4], `Nytt oppdrag: #${ORDRAR[4].order_no} ${ORDRAR[4].title}`, "fre. 13. nov. 09:00–14:00 · Kalfarveien 21, 5018 Bergen", 0, false));
      Object.assign(modus, rest);
    }
    return json(res, 200, { modus, ulest: VARSEL.filter((v) => !v.read_at).length, pushToken: PUSH_TOKEN.size, timer: TIMER.length, materiell: MATERIELL.length, notat: NOTAT.length, dokument: DOKUMENT.length, ordrar: ORDRAR.map((o) => ({ nr: o.order_no, status: o.status })) });
  }
  if (sti === "/__bilde.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Access-Control-Allow-Origin": "*" });
    return res.end(BILDE);
  }

  // --- Supabase Auth -------------------------------------------------------
  if (sti === "/auth/v1/token") {
    const type = url.searchParams.get("grant_type");
    if (type === "password") {
      if (body.password === "feil") return json(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return json(res, 200, sesjon(body.email ?? MEG.email));
    }
    if (type === "refresh_token") return json(res, 200, sesjon(String(body.refresh_token ?? "").replace(/^r-/, "") || MEG.email));
  }
  if (sti === "/auth/v1/logout") return json(res, 204, {});
  if (sti === "/auth/v1/user") return json(res, 200, sesjon(epostFra(req) ?? MEG.email).user);

  // --- API -----------------------------------------------------------------
  if (!sti.startsWith("/api/")) return json(res, 404, { error: "Ukjent sti" });
  const epost = epostFra(req);
  if (!epost) return json(res, 401, { error: "Ikke innlogget" });
  if (epost.startsWith("utenmodul@")) return json(res, 403, { error: "Ordre-modulen er ikke aktivert for dette selskapet." });
  if (skriving && modus.feil) return json(res, modus.feil, { error: modus.feil >= 500 ? "Serveren er nede (liksom)." : "Avvist av serveren (liksom)." });

  if (sti === "/api/app/meg") return json(res, 200, { user: { ...MEG, email: epost }, company: SELSKAP, timetyper: TIMETYPER, api_version: 1 });

  if (sti === "/api/app/varsel") {
    const liste = [...VARSEL].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return json(res, 200, { varsel: liste, ulest: liste.filter((v) => !v.read_at).length });
  }
  if (sti === "/api/app/varsel/lest" && m === "POST") {
    const ids = Array.isArray(body.ids) ? new Set(body.ids) : null;
    for (const v of VARSEL) if (!v.read_at && (!ids || ids.has(v.id))) v.read_at = naa();
    return json(res, 200, { ok: true });
  }
  if (sti === "/api/app/push-token") {
    if (!/^Expo(nent)?PushToken\[[^\]]{10,200}\]$/.test(body.token ?? "")) return json(res, 400, { error: "Ugyldig push-token." });
    if (m === "POST") PUSH_TOKEN.add(body.token);
    if (m === "DELETE") PUSH_TOKEN.delete(body.token);
    return json(res, 200, { ok: true });
  }

  if (sti === "/api/app/ordrar") {
    const rekke = { paagaar: 0, opna: 1, ferdig: 2 };
    const ordrar = ORDRAR.filter((o) => o.status in rekke).sort((a, b) => rekke[a.status] - rekke[b.status] || (a.updated_at < b.updated_at ? 1 : -1)).map((o) => ({
      id: o.id, order_no: o.order_no, status: o.status, title: o.title, customer_name: o.customer_name, customer_phone: o.customer_phone, site_address: o.site_address, updated_at: o.updated_at,
      mine_timar: TIMER.filter((t) => t.order_id === o.id && t.user_id === MEG.id).reduce((s, t) => s + t.hours, 0),
    }));
    return json(res, 200, { ordrar });
  }

  if (sti === "/api/app/kalender") {
    const alle = url.searchParams.get("alle") === "1";
    return json(res, 200, { hendingar: KALENDER().filter((h) => alle || h.deltakarar.some((d) => d.id === MEG.id)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)) });
  }

  if (sti === "/api/app/timeforslag") {
    const o = ORDRAR[2];
    const d = dato(kl(-1, 12));
    const foert = TIMER.some((t) => t.order_id === o.id && t.user_id === MEG.id && t.work_date === d);
    return json(res, 200, {
      forslag: foert ? [] : [{ user_id: MEG.id, user_name: MEG.full_name, order: { id: o.id, order_no: o.order_no, title: o.title, customer_name: o.customer_name }, work_date: d, fra: kl(-1, 10).toISOString(), til: kl(-1, 15).toISOString(), timar: 5, event_ids: [randomUUID()], price_item_id: TIMETYPER[0].id, time_type_name: TIMETYPER[0].name }],
    });
  }

  if (sti === "/api/grossist/sok") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (!q) return json(res, 200, { items: [] });
    const items = /^\d{8,14}$/.test(q) ? KATALOG.filter((v) => v.gtin === q) : /^\d+$/.test(q) ? KATALOG.filter((v) => v.item_no.startsWith(q)) : KATALOG.filter((v) => v.name.toLowerCase().includes(q));
    return json(res, 200, { items });
  }

  let t = /^\/api\/app\/ordrar\/([^/]+)$/.exec(sti);
  if (t) {
    const o = ORDRAR.find((x) => x.id === t[1]);
    return o ? json(res, 200, ordreForApp(o)) : json(res, 404, { error: "Fant ikke ordren" });
  }

  t = /^\/api\/orders\/([^/]+)(?:\/(timer|materiell|notat|dokumenter)(?:\/([^/]+))?(\/fil)?)?$/.exec(sti);
  if (t) {
    const [, id, del, radId, fil] = t;
    const o = ORDRAR.find((x) => x.id === id);
    if (!o) return json(res, 404, { error: "Fant ikke ordren" });
    const avslutta = o.status === "fakturert" || o.status === "avbrutt";

    if (!del && m === "PATCH") {
      if (body.status && body.status !== o.status) {
        if (!OVERGANGER[o.status].includes(body.status)) return json(res, 400, { error: `Kan ikke gå fra ${o.status} til ${body.status}.` });
        o.status = body.status;
        o.updated_at = naa();
      }
      return json(res, 200, o);
    }

    const tabell = { timer: TIMER, materiell: MATERIELL, notat: NOTAT, dokumenter: DOKUMENT }[del];
    if (fil && m === "GET") return json(res, 200, { url: `http://localhost:${PORT}/__bilde.svg`, expires_in: 300 });

    if (radId && m === "DELETE") {
      const i = tabell.findIndex((r) => r.id === radId && r.order_id === id);
      if (i < 0) return json(res, 404, { error: "Fant ikke føringen" });
      const eier = tabell[i].user_id ?? tabell[i].registered_by;
      if (eier !== MEG.id && MEG.role !== "admin") return json(res, 403, { error: "Du kan bare endre dine egne føringer." });
      tabell.splice(i, 1);
      return json(res, 200, { ok: true });
    }

    if (m === "POST" && tabell) {
      let clientId = body.client_id ?? null;
      let skjema = body;
      if (del === "dokumenter") {
        // Multipart: plukk tekstfeltene ut med en enkel regex — nok for en liksom-server.
        const tekst = kropp.toString("latin1");
        const felt = (navn) => new RegExp(`name="${navn}"\\r\\n\\r\\n([^\\r]*)`).exec(tekst)?.[1] ?? null;
        skjema = { title: felt("title"), note_id: felt("note_id") };
        clientId = felt("client_id");
      }
      const finst = clientId ? tabell.find((r) => r.client_id === clientId && r.order_id === id) : null;
      if (finst) return json(res, 200, finst);
      if (avslutta) return json(res, 400, { error: "Ordren er avsluttet og kan ikke føres på." });
      const no = naa();
      let rad;
      if (del === "timer") {
        const type = TIMETYPER.find((x) => x.id === body.price_item_id);
        const timar = Number(String(body.hours).replace(",", "."));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.work_date ?? "")) return json(res, 400, { error: "Datoen mangler eller er ugyldig." });
        if (!(timar > 0 && timar <= 24)) return json(res, 400, { error: "Timer må være mellom 0 og 24." });
        if (!type) return json(res, 400, { error: "Velg en timetype fra timeprislisten." });
        rad = { id: randomUUID(), company_id: SELSKAP.id, order_id: id, user_id: MEG.id, work_date: body.work_date, price_item_id: type.id, time_type_name: type.name, unit_price: type.unit_price, hours: timar, note: body.note?.trim() || null, billable: true, created_by: MEG.id, created_at: no, updated_at: no, invoice_draft_id: null, client_id: clientId };
      } else if (del === "materiell") {
        const mengde = Number(body.quantity);
        if (!(mengde > 0)) return json(res, 400, { error: "Mengden må være større enn 0." });
        if (body.supplier_item_id) {
          const v = KATALOG.find((x) => x.id === body.supplier_item_id);
          if (!v) return json(res, 404, { error: "Fant ikke varen i katalogen." });
          const kost = v.net_price_per_unit ?? v.list_price_per_unit;
          rad = { supplier_item_id: v.id, item_no: v.item_no, name: v.name, unit: v.unit, cost_price: kost, sale_price: Math.round(kost * 125) / 100 };
        } else {
          if (!body.name?.trim()) return json(res, 400, { error: "Linjen må ha et navn." });
          if (body.sale_price == null && body.cost_price == null) return json(res, 400, { error: "Oppgi salgspris, eller kostpris så påslaget regner salgsprisen." });
          rad = { supplier_item_id: null, item_no: null, name: body.name.trim(), unit: body.unit || "stk", cost_price: body.cost_price ?? null, sale_price: body.sale_price ?? Math.round(body.cost_price * 125) / 100 };
        }
        rad = { id: randomUUID(), company_id: SELSKAP.id, order_id: id, source: "manuell", ...rad, quantity: mengde, markup_pct: 25, note: body.note ?? null, billable: true, registered_by: MEG.id, registered_at: no, updated_at: no, invoice_line_id: null, replaced_by: null, invoice_draft_id: null, client_id: clientId };
      } else if (del === "notat") {
        const tekst = (body.text ?? "").trim();
        if (!tekst) return json(res, 400, { error: "Notatet er tomt." });
        rad = { id: randomUUID(), company_id: SELSKAP.id, order_id: id, user_id: MEG.id, text: tekst, client_id: clientId, created_at: no, updated_at: no };
      } else {
        if (skjema.note_id && !NOTAT.some((n) => n.id === skjema.note_id && n.order_id === id)) return json(res, 400, { error: "Notatet hører ikke til denne ordren." });
        rad = { id: randomUUID(), order_id: id, kind: "fil", title: skjema.title || "Bilde", file_name: "bilde.jpg", mime_type: "image/jpeg", note_id: skjema.note_id, created_at: no, client_id: clientId };
      }
      tabell.push(rad);
      return json(res, 201, rad);
    }
  }

  return json(res, 404, { error: "Ukjent sti" });
});

server.listen(PORT, () => console.log(`Liksom-server på http://localhost:${PORT}`));
