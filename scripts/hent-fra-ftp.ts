/**
 * Henter én fil fra grossistens FTP med oppsettet som er lagret i Devello,
 * og lagrer den lokalt — til feilsøking av filformater.
 *
 *   npm run ftp:hent -- Onninen V4priser.kost C:\Users\meg\Downloads\V4priser.kost
 *
 * Første argument er grossistens navn (eller id), andre er filnavn eller
 * mønster (V4* = nyeste som matcher), tredje er hvor fila skal lagres.
 * Passordet leses fra databasen og skrives aldri ut.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { hentNyaste, type FtpOppsett } from "@/lib/grossist/ftp";

const [grossist, monster, utfil] = process.argv.slice(2);
if (!grossist || !monster || !utfil) {
  console.error("Bruk: npm run ftp:hent -- <grossist> <filnavn|mønster> <lagre-som>");
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY i .env.local");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const erId = /^[0-9a-f-]{36}$/i.test(grossist);
const { data: rader, error } = await admin
  .from("supplier_ftp")
  .select("supplier_id, protocol, host, port, username, password, remote_path, suppliers!inner(name)");
if (error) throw new Error(error.message);
const rad = (rader ?? []).find((x) => {
  const namn = String((x.suppliers as unknown as { name: string }).name);
  return erId ? x.supplier_id === grossist : namn.toLowerCase() === grossist.toLowerCase();
});
if (!rad) {
  console.error(`Fant ingen grossist «${grossist}» med FTP-oppsett.`);
  process.exit(1);
}

const oppsett: FtpOppsett = {
  protocol: rad.protocol,
  host: rad.host,
  port: rad.port,
  username: rad.username,
  password: rad.password,
  remote_path: rad.remote_path,
};

const henta = await hentNyaste(oppsett, monster);
if (!henta) {
  console.error(`Ingen fil på serveren matcher «${monster}».`);
  process.exit(1);
}
writeFileSync(utfil, henta.bytes);
console.log(`${henta.fil.name} (${(henta.bytes.length / 1024 / 1024).toFixed(1)} MB) lagret som ${utfil}`);
