/**
 * Prøve på filmønster-matching og valget av nyeste fil — uten nettverk.
 *
 *   npm run test:ftp-monster
 */
import { forklar, matcharMonster, velNyaste } from "@/lib/grossist/ftp";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

sjekk("V4* matcher V4varefil.zip", matcharMonster("V4varefil.zip", "V4*"));
sjekk("V4* matcher små bokstaver", matcharMonster("v4varefil.txt", "V4*"));
sjekk("V4* matcher ikke R4rabatt.txt", !matcharMonster("R4rabatt.txt", "V4*"));
sjekk("*.zip matcher bare zip", matcharMonster("V4varefil.zip", "*.zip") && !matcharMonster("V4varefil.txt", "*.zip"));
sjekk("? er ett tegn", matcharMonster("V4_2026.txt", "V?_2026.txt") && !matcharMonster("V44_2026.txt", "V?_2026.txt"));
sjekk("punktum i mønsteret er bokstavelig", !matcharMonster("V4varefilXzip", "V4varefil.zip"));
sjekk("tomt mønster matcher ingenting", !matcharMonster("V4varefil.zip", ""));
sjekk("regex-tegn i navnet skader ikke", matcharMonster("V4 (kopi).zip", "V4 (kopi).zip"));

const filer = [
  { name: "V4varefil_2026-08-01.zip", size: 10, mtime: "2026-08-01T03:00:00Z" },
  { name: "V4varefil_2026-09-26.zip", size: 10, mtime: "2026-09-26T03:00:00Z" },
  { name: "V4varefil_2026-09-12.zip", size: 10, mtime: "2026-09-12T03:00:00Z" },
  { name: "R4rabatt_2026-09-01.txt", size: 2, mtime: "2026-09-01T03:00:00Z" },
  { name: "lesmeg.txt", size: 1, mtime: null },
];
sjekk("nyeste V4 på mtime", velNyaste(filer, "V4*")?.name === "V4varefil_2026-09-26.zip");
sjekk("nyeste R4", velNyaste(filer, "R4*")?.name === "R4rabatt_2026-09-01.txt");
sjekk("ingen treff → null", velNyaste(filer, "X9*") === null);

const utanTid = [
  { name: "V4varefil_2026-08-01.zip", size: 1, mtime: null },
  { name: "V4varefil_2026-09-26.zip", size: 1, mtime: null },
];
sjekk("uten mtime: siste på navn vinner", velNyaste(utanTid, "V4*")?.name === "V4varefil_2026-09-26.zip");

const blanda = [
  { name: "V4varefil_2026-09-30.zip", size: 1, mtime: null },
  { name: "V4varefil_2026-09-26.zip", size: 1, mtime: "2026-09-26T03:00:00Z" },
];
sjekk("fil med mtime går foran fil uten", velNyaste(blanda, "V4*")?.name === "V4varefil_2026-09-26.zip");

const o = { protocol: "ftps" as const, host: "ftp.onninen.no", port: null, username: "star", password: "hemmelig123", remote_path: "/" };
sjekk("feil oversettes: ENOTFOUND", /Fikk ikke kontakt/.test(forklar(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }), o).message));
sjekk("feil oversettes: 530", /Innlogging avvist/.test(forklar(new Error("530 Login incorrect."), o).message));
sjekk("feil oversettes: TLS", /TLS-feil/.test(forklar(new Error("Error: 140... SSL routines handshake failure"), o).message));
sjekk("passordet lekker ikke i meldingen", !forklar(new Error("Unexpected: hemmelig123 rejected"), o).message.includes("hemmelig123"));

console.log(feil === 0 ? "\nAlle sjekker grønne." : `\n${feil} sjekk(er) feilet.`);
process.exit(feil === 0 ? 0 : 1);
