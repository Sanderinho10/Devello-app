import sharp from "sharp";
import { gjenkjenn, normaliser, oversiktsblokk, velgTilModell } from "@/lib/leads/vedlegg";
import { kanBliVedlegg, MAKS_BILDER_TIL_MODELL, MAKS_PDF_SIDER_TIL_MODELL } from "@/lib/leads/vedlegg-grenser";

/**
 * Vedlegg på leads.
 *
 * Det som må holde: typen avgjøres av innholdet, ikke navnet; bilder kommer
 * ut som JPEG innenfor 1568 px og står riktig vei; logoer blir ikke med;
 * PDF-er telles i sider; og taket på hva modellen får, holder.
 */

let feil = 0;
function sjekk(navn: string, faktisk: unknown, venta: unknown) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(venta);
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${navn.padEnd(56)} ${JSON.stringify(faktisk)}${ok ? "" : ` (venta ${JSON.stringify(venta)})`}`);
}

/** En gyldig PDF med n tomme sider, skrevet for hånd. */
function pdf(n: number): Buffer {
  const objs: string[] = [];
  const kids = Array.from({ length: n }, (_, i) => `${3 + i} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  for (let i = 0; i < n; i++) objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>");
  let body = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) body += `${String(o).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const stortPng = await sharp({ create: { width: 4000, height: 3000, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 0.5 } } }).png().toBuffer();
const logo = await sharp({ create: { width: 120, height: 40, channels: 3, background: "#000" } }).png().toBuffer();
// Mobilbilde tatt stående: lagret liggende, med EXIF som sier «roter 90°».
const staaende = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#888" } })
  .jpeg()
  .withMetadata({ orientation: 6 })
  .toBuffer();

// 1. Typen fra innholdet
sjekk("PNG kjennes igjen", gjenkjenn(stortPng), "bilde");
sjekk("PDF kjennes igjen", gjenkjenn(pdf(1)), "pdf");
sjekk("Word er ikke vedlegg", gjenkjenn(Buffer.from("PK\x03\x04aaaaaaaaaa")), null);
sjekk("filnavnet lyver ikke til oss", gjenkjenn(Buffer.from("dette er tekst, ikke jpg")), null);

// 2. Bilder
const n1 = await normaliser("tavle.png", stortPng);
if ("avvist" in n1) throw new Error(n1.avvist);
const m1 = await sharp(n1.bytes).metadata();
sjekk("PNG blir JPEG", [n1.mime, m1.format], ["image/jpeg", "jpeg"]);
sjekk("skalert til 1568 på lengste side", [m1.width, m1.height], [1568, 1176]);
sjekk("filnavnet får .jpg", n1.filnavn, "tavle.jpg");
sjekk("mye mindre enn originalen", n1.bytes.length < stortPng.length / 4, true);

const n2 = await normaliser("IMG_0412.JPG", staaende);
if ("avvist" in n2) throw new Error(n2.avvist);
const m2 = await sharp(n2.bytes).metadata();
sjekk("stående mobilbilde står rett (EXIF)", [m2.width, m2.height], [1045, 1568]);

const n3 = await normaliser("logo.png", logo);
sjekk("logo avvises", "avvist" in n3, true);

// 3. PDF
const n4 = await normaliser("plantegning.pdf", pdf(3));
sjekk("PDF telles i sider", "avvist" in n4 ? n4.avvist : n4.sider, 3);
const n5 = await normaliser("oedelagt.pdf", Buffer.from("%PDF-1.4\nsøppel søppel søppel"));
sjekk("ødelagt PDF avvises", "avvist" in n5, true);

// 3b. HEIC og AVIF — iPhone-formatet og etterfølgeren
const ftyp = (hoved: string, ...kompatible: string[]) => {
  const boks = Buffer.alloc(16 + 4 * kompatible.length);
  boks.writeUInt32BE(boks.length, 0);
  boks.write("ftyp", 4, "latin1");
  boks.write(hoved, 8, "latin1");
  kompatible.forEach((m, i) => boks.write(m, 16 + 4 * i, "latin1"));
  return Buffer.concat([boks, Buffer.alloc(16)]);
};
sjekk("HEIC fra iPhone kjennes igjen", gjenkjenn(ftyp("heic", "mif1", "heic")), "bilde");
sjekk("HEIF med mif1 som hovedmerke", gjenkjenn(ftyp("mif1", "mif1", "heic")), "bilde");
sjekk("MP4-video er ikke bilde", gjenkjenn(ftyp("isom", "isom", "mp42")), null);

const avif = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#468" } }).avif().toBuffer();
const n6 = await normaliser("bilde.avif", avif);
if ("avvist" in n6) throw new Error(n6.avvist);
const m6 = await sharp(n6.bytes).metadata();
sjekk("AVIF blir JPEG, skalert", [n6.filnavn, m6.format, m6.width], ["bilde.jpg", "jpeg", 1568]);

// Et ekte HEIC-bilde er ikke sjekket inn (lisens og størrelse). Pek
// HEIC_TESTFIL på et bilde fra en iPhone for å kjøre denne delen.
const heicFil = process.env.HEIC_TESTFIL;
if (heicFil) {
  const { readFileSync } = await import("node:fs");
  const t0 = Date.now();
  const n7 = await normaliser("IMG_2231.HEIC", readFileSync(heicFil));
  if ("avvist" in n7) throw new Error(n7.avvist);
  const m7 = await sharp(n7.bytes).metadata();
  sjekk("HEIC blir JPEG innenfor 1568 px", [n7.filnavn, m7.format, Math.max(m7.width!, m7.height!) <= 1568], ["IMG_2231.jpg", "jpeg", true]);
  console.log(`     (HEIC dekodet og skalert på ${Date.now() - t0} ms, ${Math.round(n7.bytes.length / 1024)} kB)`);
} else {
  console.log("hopp HEIC-fil: sett HEIC_TESTFIL for å teste et ekte iPhone-bilde");
}

// 4. Utvalget til modellen
const bilde = { mime_type: "image/jpeg", pages: null };
const pdfRad = (sider: number) => ({ mime_type: "application/pdf", pages: sider });
sjekk(`maks ${MAKS_BILDER_TIL_MODELL} bilder`, velgTilModell(Array(12).fill(bilde)).filter(Boolean).length, MAKS_BILDER_TIL_MODELL);
sjekk(
  `maks ${MAKS_PDF_SIDER_TIL_MODELL} PDF-sider, en mindre PDF etterpå får plass`,
  velgTilModell([pdfRad(20), pdfRad(20), pdfRad(5)]),
  [true, false, true],
);
sjekk("bilder og PDF telles hver for seg", velgTilModell([pdfRad(30), bilde]), [true, true]);

// 5. Oversikten modellen får
const o = oversiktsblokk(["Vedlegg 1: tavle.jpg (bilde)"], ["Vedlegg 2: anbud.pdf (over taket)"]);
sjekk("oversikt: nevner det som er med", o.includes("- Vedlegg 1: tavle.jpg (bilde)"), true);
sjekk("oversikt: ber om merknad for det som ikke er lest", o.includes("IKKE sendt med") && o.includes("merknader"), true);

// 6. Hva som slippes inn i det hele tatt
sjekk("kanBliVedlegg: jpg", kanBliVedlegg("bilde.JPG"), true);
sjekk("kanBliVedlegg: pdf via mime", kanBliVedlegg("uten-endelse", "application/pdf"), true);
sjekk("kanBliVedlegg: docx", kanBliVedlegg("befaring.docx"), false);
sjekk("kanBliVedlegg: heic", kanBliVedlegg("IMG_1.HEIC", ""), true);
sjekk("kanBliVedlegg: heic via mime", kanBliVedlegg("bilde", "image/heic"), true);

if (feil > 0) {
  console.log(`\n${feil} feil.`);
  process.exit(1);
}
console.log("\nAlle testar passerte.");
