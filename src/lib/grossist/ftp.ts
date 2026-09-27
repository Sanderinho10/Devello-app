import { Client as FtpClient } from "basic-ftp";
import SftpClient from "ssh2-sftp-client";
import { Writable } from "node:stream";

/**
 * Henting av prisfiler fra grossistens FTP-område.
 *
 * FTP/FTPS med basic-ftp (FTPS = eksplisitt TLS; på port 990 implisitt),
 * SFTP med ssh2-sftp-client. Én katalog, ett filmønster, nyeste fil vinner.
 * Passordet går inn her og ingen andre steder — det logges aldri, og
 * feilmeldingene som kommer ut sier hva som gikk galt uten å gjenta det.
 */

export interface FtpOppsett {
  protocol: "ftp" | "ftps" | "sftp";
  host: string;
  port: number | null;
  username: string;
  password: string;
  remote_path: string;
}

export interface FjernFil {
  name: string;
  size: number;
  /** ISO. Null når serveren ikke oppgir tidspunkt. */
  mtime: string | null;
}

export class FtpFeil extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FtpFeil";
  }
}

const TIDSAVBROT_MS = 60_000;
const FORSOK = 3;

// ---------------------------------------------------------------------------
// Filmønster — ren, testbar
// ---------------------------------------------------------------------------

/** Enkel glob: `*` = alt, `?` = ett tegn. Uavhengig av store/små bokstaver. */
export function matcharMonster(namn: string, monster: string): boolean {
  const m = monster.trim();
  if (!m) return false;
  const re = new RegExp(
    "^" + m.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    "i",
  );
  return re.test(namn);
}

/**
 * Nyeste fil som matcher mønsteret. Nyeste = høyest mtime; mangler mtime,
 * vinner det som sorterer sist på navn — grossistene daterer filnavnene.
 */
export function velNyaste(filer: FjernFil[], monster: string): FjernFil | null {
  const treff = filer.filter((f) => matcharMonster(f.name, monster));
  if (treff.length === 0) return null;
  return treff.sort((a, b) => {
    const ta = a.mtime ? Date.parse(a.mtime) : NaN;
    const tb = b.mtime ? Date.parse(b.mtime) : NaN;
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
    if (Number.isFinite(ta) !== Number.isFinite(tb)) return Number.isFinite(ta) ? -1 : 1;
    return b.name.localeCompare(a.name);
  })[0];
}

// ---------------------------------------------------------------------------
// Tilkobling
// ---------------------------------------------------------------------------

interface Tilkobling {
  list(): Promise<FjernFil[]>;
  hent(name: string): Promise<Buffer>;
  lukk(): Promise<void>;
}

async function medTidsavbrot<T>(p: Promise<T>, hva: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const avbrot = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FtpFeil(`${hva} tok mer enn 60 sekunder.`)), TIDSAVBROT_MS);
  });
  try {
    return await Promise.race([p, avbrot]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function kopleTil(o: FtpOppsett): Promise<Tilkobling> {
  const sti = o.remote_path?.trim() || "/";

  if (o.protocol === "sftp") {
    const sftp = new SftpClient();
    await medTidsavbrot(
      sftp.connect({
        host: o.host,
        port: o.port ?? 22,
        username: o.username,
        password: o.password,
        readyTimeout: TIDSAVBROT_MS,
      }),
      "Tilkoblingen",
    );
    return {
      async list() {
        const liste = await medTidsavbrot(sftp.list(sti), "Listingen");
        return liste
          .filter((f) => f.type !== "d")
          .map((f) => ({ name: f.name, size: Number(f.size) || 0, mtime: f.modifyTime ? new Date(f.modifyTime).toISOString() : null }));
      },
      async hent(name) {
        const data = await medTidsavbrot(sftp.get(`${sti.replace(/\/$/, "")}/${name}`), "Nedlastingen");
        return Buffer.isBuffer(data) ? data : Buffer.from(String(data));
      },
      async lukk() {
        await sftp.end().catch(() => undefined);
      },
    };
  }

  const ftp = new FtpClient(TIDSAVBROT_MS);
  const secure: boolean | "implicit" = o.protocol === "ftps" ? (o.port === 990 ? "implicit" : true) : false;
  await ftp.access({
    host: o.host,
    port: o.port ?? (secure === "implicit" ? 990 : 21),
    user: o.username,
    password: o.password,
    secure,
    secureOptions: secure ? { rejectUnauthorized: false } : undefined,
  });
  return {
    async list() {
      const liste = await ftp.list(sti);
      return liste
        .filter((f) => f.isFile)
        .map((f) => ({ name: f.name, size: f.size, mtime: f.modifiedAt ? f.modifiedAt.toISOString() : rawTilIso(f.rawModifiedAt) }));
    },
    async hent(name) {
      const deler: Buffer[] = [];
      const sink = new Writable({
        write(chunk, _enc, cb) {
          deler.push(Buffer.from(chunk));
          cb();
        },
      });
      await ftp.downloadTo(sink, `${sti.replace(/\/$/, "")}/${name}`);
      return Buffer.concat(deler);
    },
    async lukk() {
      ftp.close();
    },
  };
}

/** basic-ftp gir «Sep 26 03:14» eller «Sep 26 2025» rått; vi prøver å tolke det. */
function rawTilIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = Date.parse(raw.includes(":") && !/\d{4}/.test(raw) ? `${raw} ${new Date().getFullYear()}` : raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Kjører en operasjon mot serveren med opptil tre forsøk og pause imellom.
 * Innloggingsfeil og manglende fil prøves ikke på nytt — de blir ikke bedre.
 */
async function medForsok<T>(o: FtpOppsett, fn: (t: Tilkobling) => Promise<T>): Promise<T> {
  let sisteFeil: unknown = null;
  for (let forsok = 1; forsok <= FORSOK; forsok++) {
    let t: Tilkobling | null = null;
    try {
      t = await kopleTil(o);
      return await fn(t);
    } catch (err) {
      sisteFeil = err;
      const oversatt = forklar(err, o);
      if (oversatt instanceof FtpFeil && !oversatt.message.startsWith("Fikk ikke kontakt") && !/tok mer enn/.test(oversatt.message)) {
        throw oversatt;
      }
      if (forsok < FORSOK) await new Promise((r) => setTimeout(r, 2000 * forsok));
    } finally {
      await t?.lukk();
    }
  }
  throw forklar(sisteFeil, o);
}

export async function listFiler(o: FtpOppsett): Promise<FjernFil[]> {
  return medForsok(o, (t) => t.list());
}

/** Nyeste fil som matcher mønsteret, lastet ned. Null når ingen matcher. */
export async function hentNyaste(
  o: FtpOppsett,
  monster: string,
): Promise<{ fil: FjernFil; bytes: Buffer } | null> {
  return medForsok(o, async (t) => {
    const fil = velNyaste(await t.list(), monster);
    if (!fil) return null;
    return { fil, bytes: await t.hent(fil.name) };
  });
}

/** Feilene oversatt til noe kunden kan handle på. Passordet er aldri med. */
export function forklar(err: unknown, o: FtpOppsett): FtpFeil {
  if (err instanceof FtpFeil) return err;
  const m = (err instanceof Error ? err.message : String(err)).replace(new RegExp(escapeRe(o.password), "g"), "•••");
  const kode = (err as { code?: string })?.code ?? "";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|ECONNRESET/.test(kode + m)) {
    return new FtpFeil(`Fikk ikke kontakt med ${o.host}${o.port ? `:${o.port}` : ""}. Sjekk vert, port og protokoll.`);
  }
  if (/530|Login incorrect|authentication|All configured authentication methods failed|Permission denied/i.test(m)) {
    return new FtpFeil("Innlogging avvist. Sjekk brukernavn og passord.");
  }
  if (/TLS|SSL|certificate|handshake|EPROTO|secure/i.test(m)) {
    return new FtpFeil("TLS-feil — prøv protokoll FTP eller SFTP, eller port 990 for implisitt FTPS.");
  }
  if (/550|No such file|not found|ENOENT/i.test(m)) {
    return new FtpFeil(`Fant ikke katalogen ${o.remote_path || "/"} på serveren.`);
  }
  return new FtpFeil(`Feil mot ${o.host}: ${m.slice(0, 200)}`);
}

function escapeRe(s: string): string {
  return s.length ? s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "(?!)";
}
