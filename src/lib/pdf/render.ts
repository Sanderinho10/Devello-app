import { chromium, type Browser } from "playwright-core";

/**
 * HTML → PDF.
 *
 * Implementasjonen er isolert bak denne funksjonen med vilje. Vil man senere
 * bytte til en hostet PDF-tjeneste eller en serverless-vennlig chromium-build,
 * er det denne filen som skal endres — ingenting annet rører rendringen.
 *
 * PLAYWRIGHT_BROWSERS_PATH må peke på en chromium-installasjon, eller
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE på binærfilen direkte.
 */

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      })
      .catch((err) => {
        // Ikke cache et mislykket oppstartsforsøk.
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // Margene ligger i @page-regelen i malen.
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

/** For test og for ren avslutning i skript. */
export async function closePdfRenderer(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close();
  }
}
