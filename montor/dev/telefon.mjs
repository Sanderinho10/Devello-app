#!/usr/bin/env node
/**
 * Appen på telefonen med testdata, i én kommando:
 *
 *   npm run telefon
 *
 * Starter liksom-serveren og Expo, og peker appen på denne maskinens
 * adresse på nettverket — telefonen kan ikke nå «localhost». Skann QR-koden
 * med Expo Go. Telefonen må være på samme wifi som maskinen.
 *
 * Alt etter kommandoen går videre til Expo: `npm run telefon -- --clear`.
 * Finner skriptet feil adresse (VPN, flere nettverkskort), sett den selv:
 * `TELEFON_IP=192.168.1.23 npm run telefon`.
 */
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 4010);
const rot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Første private IPv4-adresse — den telefonen når maskinen på. */
function finnIp() {
  if (process.env.TELEFON_IP) return process.env.TELEFON_IP;
  const alle = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);
  const privat = (a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
  return alle.find(privat) ?? alle[0] ?? null;
}

const ip = finnIp();
if (!ip) {
  console.error("Fant ingen nettverksadresse. Er maskinen på wifi? Sett den selv med TELEFON_IP=<adresse>.");
  process.exit(1);
}
const url = `http://${ip}:${PORT}`;

console.log(`\nTestdata på ${url}`);
console.log("Telefonen må være på samme wifi som denne maskinen.");
console.log("Logg inn med hvilken som helst e-post og passord (passordet «feil» gir feil passord).\n");

const barn = [];
const stopp = () => barn.forEach((b) => b.kill());

const liksom = spawn(process.execPath, [join(rot, "dev", "liksom-server.mjs")], {
  cwd: rot,
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, PORT: String(PORT) },
});
barn.push(liksom);
liksom.on("exit", (kode) => {
  if (kode) {
    console.error(`Liksom-serveren stoppet (kode ${kode}). Er port ${PORT} i bruk av noe annet?`);
    stopp();
    process.exit(1);
  }
});

// shell: true så «npx» finnes på Windows også (npx.cmd).
const expo = spawn("npx", ["expo", "start", ...process.argv.slice(2)], {
  cwd: rot,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: url,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "liksom",
    EXPO_PUBLIC_API_URL: url,
  },
});
barn.push(expo);
expo.on("exit", (kode) => {
  stopp();
  process.exit(kode ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stopp);
