import { kanBliVedlegg } from "./vedlegg-grenser";

/**
 * En e-post dratt inn i «Manuell henvendelse», gjort om til det skjemaet trenger.
 *
 * Outlook for Windows gir en .msg-fil når man drar en e-post ut av innboksen;
 * Apple Mail, Thunderbird og «Lagre som» ellers gir .eml. Begge leses her, i
 * nettleseren — fila forlater aldri maskinen før brukeren har sett hva som
 * ble hentet ut og trykket «Lag utkast».
 *
 * Agenten får det samme som fra en henvendelse hentet fra Outlook: avsender,
 * emne, brødtekst — og bildene og PDF-ene som lå ved. Andre vedlegg (Word,
 * Excel) leses ikke, men navnene tas med, så agenten kan si fra om dem.
 */

export interface LestEpost {
  navn: string | null;
  epost: string | null;
  emne: string | null;
  /** Emne og brødtekst, klar for beskrivelsesfeltet. */
  tekst: string;
  /** Navnene på alle vedleggene. */
  vedlegg: string[];
  /** Bildene og PDF-ene, klare til å følge med henvendelsen til agenten. */
  filer: File[];
}

const MAKS_TEGN = 20_000;
const EPOST = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}/;

export function erEpostfil(navn: string): boolean {
  return /\.(msg|eml)$/i.test(navn);
}

export async function lesEpostfil(navn: string, bytes: ArrayBuffer): Promise<LestEpost> {
  const raa = /\.msg$/i.test(navn) ? await lesMsg(bytes) : await lesEml(bytes);
  return sett(raa);
}

interface Raa {
  navn: string | null;
  epost: string | null;
  svarTil: string | null;
  emne: string | null;
  tekst: string | null;
  html: string | null;
  vedlegg: string[];
  filer: File[];
}

async function lesEml(bytes: ArrayBuffer): Promise<Raa> {
  const { default: PostalMime } = await import("postal-mime");
  const e = await PostalMime.parse(bytes);
  const fra = e.from && "address" in e.from ? e.from : null;
  const svar = e.replyTo?.find((a) => a.address)?.address ?? null;
  // Innebygde bilder er logoen i signaturen, ikke noe kunden sendte.
  const ekte = e.attachments.filter((a) => a.disposition !== "inline" && !a.related);
  return {
    navn: fra?.name || null,
    epost: fra?.address || null,
    svarTil: svar,
    emne: e.subject ?? null,
    tekst: e.text ?? null,
    html: e.html ?? null,
    vedlegg: ekte.map((a) => a.filename).filter((n): n is string => Boolean(n)),
    filer: ekte
      .filter((a) => a.filename && kanBliVedlegg(a.filename, a.mimeType))
      .map((a) => new File([somBytes(a.content)], a.filename!, { type: a.mimeType })),
  };
}

function somBytes(innhold: ArrayBuffer | Uint8Array | string): Uint8Array<ArrayBuffer> {
  if (typeof innhold === "string") return new TextEncoder().encode(innhold) as Uint8Array<ArrayBuffer>;
  return new Uint8Array(innhold instanceof Uint8Array ? innhold : new Uint8Array(innhold)) as Uint8Array<ArrayBuffer>;
}

async function lesMsg(bytes: ArrayBuffer): Promise<Raa> {
  const mod = await import("@kenjiuno/msgreader");
  // Pakken er CommonJS. Bundleren gir klassen som default; Node gir hele
  // module.exports, med klassen ett nivå ned.
  type Klasse = typeof mod.default;
  const MsgReader: Klasse =
    (mod.default as unknown as { default?: Klasse }).default ?? mod.default;
  const leser = new MsgReader(bytes);
  const d = leser.getFileData();
  if (d.error) throw new Error("Klarte ikke å lese e-postfila.");
  // Internt i Exchange er senderEmail ofte en X.500-sti («/O=EXCHANGELABS/…»),
  // ikke en adresse. SMTP-adressen er den som kan brukes.
  // Skjulte vedlegg er bildene i signaturen og HTML-teksten.
  const synlege = (d.attachments ?? []).filter((a) => !a.attachmentHidden);
  const adresse = [d.senderSmtpAddress, d.senderEmail].find((a) => a && EPOST.test(a)) ?? null;
  return {
    navn: d.senderName || null,
    epost: adresse,
    svarTil: null,
    emne: d.subject ?? null,
    tekst: d.body ?? null,
    html: d.bodyHtml ?? (d.html ? new TextDecoder().decode(d.html) : null),
    vedlegg: synlege.map((a) => a.fileName ?? a.name ?? "").filter(Boolean),
    filer: synlege
      .filter((a) => kanBliVedlegg(a.fileName ?? a.name ?? "", a.attachMimeTag))
      .flatMap((a) => {
        try {
          const v = leser.getAttachment(a);
          return [new File([somBytes(v.content)], v.fileName, { type: a.attachMimeTag ?? "" })];
        } catch {
          return [];
        }
      }),
  };
}

function sett(r: Raa): LestEpost {
  const videresendt = r.emne ? /^\s*(fw|fwd|vs|videresendt)\s*:/i.test(r.emne) : false;
  const emne = r.emne?.replace(/^\s*((fw|fwd|vs|sv|re|videresendt)\s*:\s*)+/i, "").trim() || null;
  const brod = (r.tekst?.trim() || (r.html ? htmlTilTekst(r.html) : "")).trim();

  let navn = r.navn;
  let epost = r.epost;

  // Kontaktskjema på nettsider sender fra en noreply-adresse og legger kunden
  // i Svar-til. Det er kunden tilbudet skal til.
  if (r.svarTil && (!epost || /no-?reply|donotreply|ikke-?svar/i.test(epost))) {
    epost = r.svarTil;
    navn = null;
  }

  // En videresendt e-post er fra kollegaen som videresendte den. Kunden står
  // i hodet på den videresendte meldingen, inne i teksten.
  if (videresendt) {
    const kunde = videresendtFra(brod);
    if (kunde) {
      navn = kunde.navn;
      epost = kunde.epost;
    }
  }

  const deler = [emne, brod].filter(Boolean) as string[];
  let tekst = deler.join("\n\n");
  // Bilder og PDF-er følger med til agenten. Resten (Word, Excel, zip)
  // leses ikke, men nevnes, så agenten kan si fra om dem.
  const medFil = new Set(r.filer.map((f) => f.name));
  const uleste = r.vedlegg.filter((n) => !medFil.has(n));
  if (uleste.length > 0) {
    tekst += `\n\n[Vedlegg i e-posten som ikke er lest: ${uleste.join(", ")}]`;
  }
  tekst = tekst.trim();
  if (tekst.length > MAKS_TEGN) tekst = `${tekst.slice(0, MAKS_TEGN).trimEnd()}\n\n[…]`;

  return {
    navn: navn?.replace(/^["']|["']$/g, "").trim() || null,
    epost: epost?.toLowerCase() ?? null,
    emne,
    tekst,
    vedlegg: r.vedlegg,
    filer: r.filer,
  };
}

/**
 * «Fra: Marit Aasen <marit@example.no>» i hodet på en videresendt melding.
 * Outlook skriver også «Fra: Marit Aasen [mailto:marit@example.no]».
 */
export function videresendtFra(tekst: string): { navn: string | null; epost: string } | null {
  const linje = tekst.match(/^\s*\**(?:Fra|From)\**\s*:\s*(.+)$/im)?.[1];
  if (!linje) return null;
  const epost = linje.match(EPOST)?.[0];
  if (!epost) return null;
  const navn = linje
    .replace(/<[^>]*>|\[mailto:[^\]]*\]/gi, "")
    .replace(EPOST, "")
    .replace(/["*]/g, "")
    .trim();
  return { navn: navn || null, epost: epost.toLowerCase() };
}

/** Nok HTML-til-tekst for en e-post: avsnitt blir linjeskift, resten skrelles av. */
export function htmlTilTekst(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&aelig;/g, "æ").replace(/&oslash;/g, "ø").replace(/&aring;/g, "å")
    .replace(/&AElig;/g, "Æ").replace(/&Oslash;/g, "Ø").replace(/&Aring;/g, "Å")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
