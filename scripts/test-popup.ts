import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Popup-ene i appen er <dialog>. En lukket <dialog> er skjult av nettleserens
 * egen stilmal — `dialog:not([open]) { display: none }` — og den regelen er
 * det eneste som holder dem borte.
 *
 * Regelen taper mot alt vi skriver selv. En `.modal { display: flex }` i
 * globals.css gjorde at hver eneste popup i appen sto permanent åpen, midt i
 * sida, uten at noe i React-koden var galt: leadvinduer, «Manuell henvendelse»
 * og prislistevinduer, alle samtidig, og en refresh hjalp ikke fordi det ikke
 * var tilstand det gjaldt.
 *
 * Derfor denne. Den bygger ikke appen — den setter CSS-en på et par lukkede
 * dialoger og sjekker at de fortsatt er skjult.
 *
 *   npm run test:popup
 *
 * Krever Chromium: «npm run install:chromium», eller
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE til en installasjon.
 */
const css = readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

await page.setContent(
  `<style>${css}</style>
   <dialog class="modal"><div class="modal-body">Skal være skjult</div></dialog>
   <dialog class="modal wide"><div class="modal-body">Skal være skjult</div></dialog>
   <dialog class="modal" open><div class="modal-body">Skal være synlig</div></dialog>`,
);

const resultat = await page.evaluate(() =>
  Array.from(document.querySelectorAll("dialog")).map((d) => ({
    aapen: d.hasAttribute("open"),
    display: getComputedStyle(d).display,
    hoyde: Math.round(d.getBoundingClientRect().height),
  })),
);

await browser.close();

let feil = 0;
for (const d of resultat) {
  const ok = d.aapen ? d.display !== "none" && d.hoyde > 0 : d.display === "none" && d.hoyde === 0;
  if (!ok) feil += 1;
  console.log(
    `${ok ? "ok  " : "FEIL"} <dialog${d.aapen ? " open" : ""}> display=${d.display} høyde=${d.hoyde}`,
  );
}

if (feil > 0) {
  console.error(
    "\nEn lukket <dialog> er ikke skjult. Noe i globals.css setter display på\n" +
      ".modal og slår ut nettleserens egen regel. Fjern display-linja, eller\n" +
      "gi den nye komponenten sitt eget klassenavn.",
  );
  process.exit(1);
}
console.log("\nAlle popup-ene oppfører seg.");
