import type { DokumentData, Felt, Feltverdi, Mal, Prefill, PrefillKontekst, Seksjon } from "./malar/typar";

/**
 * Malmotoren: validering av selve malen, forhåndsutfylling fra ordren, og
 * kontrollen av påkrevde felt før «Fullfør og signer».
 *
 * Alt er deterministisk. Ingen modell er innblandet — det er montørens
 * kvalitetskontroll, og verdiene er montørens.
 */

/** Feil i selve maldefinisjonen — kjøres i test, så en ny mal aldri når produksjon med dublettnøkler. */
export function validerMal(mal: Mal): string[] {
  const feil: string[] = [];
  if (!/^[a-z0-9]+\.[a-z0-9_]+$/.test(mal.key)) feil.push(`key «${mal.key}» skal være <fag>.<navn>`);
  if (!Number.isInteger(mal.version) || mal.version < 1) feil.push("version må være et heltall ≥ 1");
  if (!mal.title.trim()) feil.push("title mangler");
  if (!mal.lovgrunnlag.trim()) feil.push("lovgrunnlag mangler");
  if (mal.sections.length === 0) feil.push("malen har ingen seksjoner");

  const seksjonsnoklar = new Set<string>();
  const feltnoklar = new Set<string>();
  for (const s of mal.sections) {
    if (seksjonsnoklar.has(s.key)) feil.push(`seksjonsnøkkel «${s.key}» er brukt to ganger`);
    seksjonsnoklar.add(s.key);
    if (s.fields.length === 0) feil.push(`seksjonen «${s.key}» har ingen felt`);
    // Felt i en repeat-seksjon lever i raden; ellers globalt i data.
    const lokale = new Set<string>();
    for (const f of s.fields) {
      const sett = s.repeat ? lokale : feltnoklar;
      if (sett.has(f.key)) feil.push(`feltnøkkel «${f.key}» er brukt to ganger${s.repeat ? ` i «${s.key}»` : ""}`);
      sett.add(f.key);
      if (!f.label.trim()) feil.push(`feltet «${f.key}» mangler label`);
      if (f.type === "select" && f.options.length === 0) feil.push(`select «${f.key}» har ingen valg`);
      if (f.type === "measure" && !f.unit) feil.push(`measure «${f.key}» mangler enhet`);
    }
    if (s.repeat && feltnoklar.has(s.key)) feil.push(`repeat-seksjonen «${s.key}» kolliderer med et feltnavn`);
    if (s.repeat) feltnoklar.add(s.key);
  }
  return feil;
}

/** Nytt dokument: prefill fra ordren, standardtekster, tomme rader for tabeller. */
export function prefillData(mal: Mal, ctx: PrefillKontekst): DokumentData {
  const data: DokumentData = {};
  for (const s of mal.sections) {
    if (s.repeat) {
      data[s.key] = Array.from({ length: s.repeat.minRows }, () => tomRad(s));
      continue;
    }
    for (const f of s.fields) {
      const v = prefillVerdi(f, ctx);
      if (v !== null) data[f.key] = v;
    }
  }
  return data;
}

function tomRad(s: Seksjon): Record<string, Feltverdi> {
  const rad: Record<string, Feltverdi> = {};
  for (const f of s.fields) rad[f.key] = f.type === "checkbox" ? false : "";
  return rad;
}

function prefillVerdi(f: Felt, ctx: PrefillKontekst): Feltverdi | null {
  if (f.type === "checkbox") return false;
  if (f.type !== "text" && f.type !== "textarea" && f.type !== "date" && f.type !== "number") return null;
  if (f.prefill) {
    const v = hentPrefill(f.prefill, ctx);
    if (v !== null && v !== "") return v;
  }
  return f.standard ?? null;
}

export function hentPrefill(p: Prefill, ctx: PrefillKontekst): string | null {
  switch (p) {
    case "company.name":
      return ctx.company.name;
    case "company.org_nr":
      return ctx.company.org_nr;
    case "company.address":
      return ctx.company.address;
    case "order.customer_name":
      return ctx.order.customer_name;
    case "order.site_address":
      return ctx.order.site_address;
    case "order.order_no":
      return String(ctx.order.order_no);
    case "order.title":
      return ctx.order.title;
    case "order.description":
      return ctx.order.description;
    case "today":
      return ctx.today;
    case "user.name":
      return ctx.user.name;
  }
  return null;
}

/**
 * Hva som mangler før dokumentet kan fullføres. Tom liste = klart.
 * Tekstene er de brukeren ser i oppsummeringen nederst på skjemaet.
 */
export function manglandePaakravde(mal: Mal, data: DokumentData): string[] {
  const manglar: string[] = [];
  for (const s of mal.sections) {
    if (s.repeat) {
      const rader = Array.isArray(data[s.key]) ? (data[s.key] as Record<string, Feltverdi>[]) : [];
      if (rader.length < s.repeat.minRows) {
        manglar.push(`${s.title}: minst ${s.repeat.minRows} ${s.repeat.minRows === 1 ? "rad" : "rader"}`);
        continue;
      }
      rader.forEach((rad, i) => {
        for (const f of s.fields) {
          if (f.required && erTom(f, rad[f.key])) manglar.push(`${s.title}, rad ${i + 1}: ${f.label}`);
        }
      });
      continue;
    }
    for (const f of s.fields) {
      if (f.required && erTom(f, data[f.key] as Feltverdi | undefined)) manglar.push(`${s.title}: ${f.label}`);
    }
  }
  return manglar;
}

function erTom(f: Felt, v: Feltverdi | undefined): boolean {
  if (f.type === "checkbox") return v !== true;
  if (v === null || v === undefined) return true;
  return String(v).trim() === "";
}

/**
 * Renser innkommende data mot malen: bare kjente nøkler, riktige typer.
 * Ukjente nøkler kastes, så et gammelt klientskjema ikke kan legge inn
 * hva som helst i jsonb-kolonnen.
 */
export function rensData(mal: Mal, inn: unknown): DokumentData {
  const kilde = (inn && typeof inn === "object" ? inn : {}) as Record<string, unknown>;
  const ut: DokumentData = {};
  for (const s of mal.sections) {
    if (s.repeat) {
      const rader = Array.isArray(kilde[s.key]) ? (kilde[s.key] as unknown[]) : [];
      ut[s.key] = rader.slice(0, 500).map((r) => {
        const rad = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
        const ren: Record<string, Feltverdi> = {};
        for (const f of s.fields) ren[f.key] = rensVerdi(f, rad[f.key]);
        return ren;
      });
      continue;
    }
    for (const f of s.fields) {
      if (f.key in kilde) ut[f.key] = rensVerdi(f, kilde[f.key]);
    }
  }
  return ut;
}

function rensVerdi(f: Felt, v: unknown): Feltverdi {
  if (f.type === "checkbox") return v === true;
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  if (typeof v === "boolean") return v ? "ja" : "";
  const s = String(v).slice(0, f.type === "textarea" ? 4000 : 300);
  if (f.type === "check3") return s === "ok" || s === "avvik" || s === "ia" ? s : "";
  if (f.type === "select") return f.options.some((o) => o.value === s) ? s : "";
  return s;
}
