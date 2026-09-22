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
sjekk("kanBliVedlegg: heic", kanBliVedlegg("IMG_1.HEIC", "image/heic"), false);

if (feil > 0) {
  console.log(`\n${feil} feil.`);
  process.exit(1);
}
console.log("\nAlle testar passerte.");
