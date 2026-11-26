#!/usr/bin/env node
/**
 * Sender en oppdatering til appene som alt er installert (EAS Update):
 *
 *   npm run oppdater -- "Kortere ordrehode"
 *
 * Montørene får den neste gang de åpner appen, uten ny installasjon.
 * Gjelder bare kode (skjermer, tekst, logikk). Nye pakker med native kode,
 * endringer i app.json eller ny Expo-versjon krever nytt bygg — og da skal
 * "version" i app.json opp, så gamle apper ikke får en oppdatering de ikke
 * tåler.
 *
 * Oppdateringen bygges på denne maskinen, så adressene den bakes med er de
 * som står her. Skriptet nekter derfor å sende noe som peker på en
 * utviklingsmaskin: API-adressen settes alltid til nettappen i drift, og
 * Supabase-verdiene (fra .env eller miljøet) må være de ekte.
 *
 * Kanal: preview (appene bygget med --profile preview). En annen kanal:
 * KANAL=production npm run oppdater -- "…"
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rot = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = "https://app.devello.no";
const kanal = process.env.KANAL ?? "preview";
const [melding, ...rest] = process.argv.slice(2);

function stopp(tekst) {
  console.error(`\nSendte ingenting: ${tekst}\n`);
  process.exit(1);
}

if (!melding || melding.startsWith("-")) stopp('skriv hva oppdateringen er, f.eks. npm run oppdater -- "Kortere ordrehode"');

/** Verdiene i .env — miljøet går foran, som hos Expo. */
function lesEnv() {
  const fil = join(rot, ".env");
  const ut = {};
  if (existsSync(fil)) {
    for (const linje of readFileSync(fil, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linje);
      if (m) ut[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return { ...ut, ...process.env };
}

const env = lesEnv();
const supabase = env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const nokkel = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabase)) {
  stopp(`EXPO_PUBLIC_SUPABASE_URL må være den ekte Supabase-adressen (https://<prosjekt>.supabase.co), ikke «${supabase || "tom"}». Sett den i montor/.env.`);
}
if (nokkel.length < 20 || nokkel === "liksom") {
  stopp("EXPO_PUBLIC_SUPABASE_ANON_KEY mangler eller er testnøkkelen. Sett den ekte i montor/.env.");
}

console.log(`\nSender «${melding}» til kanalen ${kanal}`);
console.log(`  API:      ${API_URL}`);
console.log(`  Supabase: ${supabase}\n`);

// shell: true så «npx» finnes på Windows også (npx.cmd) — meldingen siteres selv.
const sitert = `"${melding.replace(/"/g, "'")}"`;
const eas = spawn("npx", ["eas-cli@latest", "update", "--channel", kanal, "--message", sitert, ...rest], {
  cwd: rot,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: supabase, EXPO_PUBLIC_SUPABASE_ANON_KEY: nokkel, EXPO_PUBLIC_API_URL: API_URL },
});
eas.on("exit", (kode) => process.exit(kode ?? 0));
