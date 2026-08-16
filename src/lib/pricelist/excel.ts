import ExcelJS from "exceljs";
import {
  PRICE_KIND_LABELS,
  type PriceItemKind,
} from "@/lib/types";

/**
 * Excel-malen og innlesingen bor i samme fil med vilje. Endrer man kolonnene i
 * malen uten å endre innlesingen, får kunden en fil som ikke kan importeres —
 * og det er en feil som ikke viser seg før noen prøver.
 */

interface ColumnSpec {
  /** Overskriften som blir skrevet i malen. */
  header: string;
  /** Alt vi godtar som denne kolonnen ved innlesing, normalisert. */
  aliases: string[];
  width: number;
  required: boolean;
}

const COLUMNS = {
  name: {
    header: "Navn",
    // Nynorskformene står igjen med vilje: filer laget før dette skal
    // fortsatt kunne importeres.
    aliases: ["navn", "namn", "produkt", "produktnavn", "produktnamn", "post", "tekst", "name"],
    width: 42,
    required: true,
  },
  unit: {
    header: "Enhet",
    aliases: ["enhet", "eining", "einheit", "unit", "mengde", "måleenhet", "maaleenhet", "måleeining"],
    width: 12,
    required: true,
  },
  unit_price: {
    header: "Pris eks. mva",
    aliases: ["pris eks. mva", "pris eks mva", "pris", "enhetspris", "einingspris", "kroner", "kr", "price", "sum"],
    width: 16,
    required: true,
  },
  code: {
    header: "Kode",
    aliases: ["kode", "varenummer", "varenr", "artikkelnummer", "artnr", "nummer", "code", "sku"],
    width: 14,
    required: false,
  },
  description: {
    header: "Beskrivelse",
    aliases: ["beskrivelse", "skildring", "merknad", "kommentar", "notat", "description"],
    width: 40,
    required: false,
  },
} satisfies Record<string, ColumnSpec>;

type ColumnKey = keyof typeof COLUMNS;

const COLUMN_ORDER: ColumnKey[] = ["name", "unit", "unit_price", "code", "description"];

/** Eksempelrader per listetype, så malen viser hva som er forventet. */
const EXAMPLES: Record<PriceItemKind, string[][]> = {
  punktpris: [
    ["Montering stikkontakt, dobbel", "stk", "890", "EL-104", "Standard dobbel kontakt i eksisterende vegg"],
    ["Montering takpunkt med bryter", "stk", "1340", "", ""],
    ["Montering varmekabel", "m²", "1150", "", "Inkl. kabel og termostat-tilkobling"],
  ],
  materiell: [
    ["Sikringsskap 24 moduler", "stk", "4200", "M-2400", ""],
    ["Jordfeilautomat 16 A", "stk", "640", "", ""],
    ["Kabel PFSP 3G2,5", "m", "38", "", "Pris per meter"],
  ],
  time: [
    ["Timepris elektriker", "time", "1190", "", "Ordinær arbeidstid"],
    ["Timepris lærling", "time", "760", "", ""],
    ["Kjøring", "stk", "450", "", "Per oppdrag innenfor kommunen"],
  ],
};

// ---------------------------------------------------------------------------
// Mal
// ---------------------------------------------------------------------------

export async function buildTemplate(kind: PriceItemKind): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Devello";
  workbook.created = new Date(0);

  const sheet = workbook.addWorksheet(PRICE_KIND_LABELS[kind]);
  sheet.columns = COLUMN_ORDER.map((key) => ({
    header: COLUMNS[key].header,
    key,
    width: COLUMNS[key].width,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D1D1F" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const example of EXAMPLES[kind]) {
    sheet.addRow(example);
  }

  // Marker eksempelradene tydelig, så de ikke blir importert ved et uhell.
  for (let rowNumber = 2; rowNumber <= 1 + EXAMPLES[kind].length; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    row.font = { italic: true, color: { argb: "FF86868B" } };
  }

  const note = sheet.getRow(2 + EXAMPLES[kind].length + 1);
  note.getCell(1).value =
    "↑ Radene over er eksempler. Slett dem og lim inn dine egne. Navn, enhet og pris må være utfylt.";
  note.getCell(1).font = { italic: true, color: { argb: "FF86868B" }, size: 10 };

  // Advarselen står her, i fila, og ikke bare i appen — det er her folk er
  // idet de limer inn, og det er limingen som drar sammenslåingene med seg.
  const pasteNote = sheet.getRow(2 + EXAMPLES[kind].length + 2);
  pasteNote.getCell(1).value =
    "Lim inn med «Lim inn spesial → Verdier» (Ctrl+Shift+V). Limer du inn vanlig, " +
    "følger sammenslåtte celler med fra den gamle filen, og da leser Excel samme " +
    "pris på flere rader.";
  pasteNote.getCell(1).font = { italic: true, color: { argb: "FF86868B" }, size: 10 };

  sheet.getColumn("unit_price").numFmt = "# ##0";
  sheet.getColumn("unit_price").alignment = { horizontal: "right" };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function templateFileName(kind: PriceItemKind): string {
  return `devello-${kind}-mal.xlsx`;
}

// ---------------------------------------------------------------------------
// Innlesing
// ---------------------------------------------------------------------------

export interface ParsedRow {
  name: string;
  unit: string;
  unit_price: number;
  code: string | null;
  description: string | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Feil per rad. Er denne ikke tom, blir ingenting importert. */
  errors: string[];
  /** Tomme rader vi hoppet over uten å klage. */
  skipped: number;
}

export async function parseWorkbook(file: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    return {
      rows: [],
      errors: [
        "Klarte ikke å lese filen. Er den lagret som .xlsx? Gamle .xls-filer må lagres på nytt i nyere format.",
      ],
      skipped: 0,
    };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], errors: ["Arbeidsboken har ingen ark."], skipped: 0 };
  }

  const mapping = mapHeaders(sheet.getRow(1));
  if ("error" in mapping) {
    return { rows: [], errors: [mapping.error], skipped: 0 };
  }

  // Sammenslåtte celler må stoppes før vi leser noe som helst.
  //
  // Excel gir samme verdi til hver rad en sammenslåing dekker. En kode eller
  // en pris slått sammen over to rader blir dermed lest som to like verdier,
  // og importen ville gått gjennom med feil priser uten at noe så galt ut.
  // Det er den slags feil som først viser seg i et tilbud hos en kunde.
  const merge = mergeProblem(sheet, mapping.columns);
  if (merge) return { rows: [], errors: [merge], skipped: 0 };

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  let skipped = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const name = text(row.getCell(mapping.columns.name));
    const unit = text(row.getCell(mapping.columns.unit));
    const rawPrice = row.getCell(mapping.columns.unit_price).value;

    // Helt tomme rader, og notatlinjen i malen, går stille forbi.
    if (!name && !unit && (rawPrice === null || rawPrice === undefined || rawPrice === "")) {
      skipped += 1;
      return;
    }
    if (!name || !unit) {
      // En rad med bare tekst i første kolonne er som regel en kommentar.
      if (name && !unit && (rawPrice === null || rawPrice === undefined || rawPrice === "")) {
        skipped += 1;
        return;
      }
      errors.push(`Rad ${rowNumber}: navn og enhet må være utfylt.`);
      return;
    }

    const price = toNumber(rawPrice);
    if (price === null) {
      errors.push(
        `Rad ${rowNumber}: «${text(row.getCell(mapping.columns.unit_price))}» er ikke et tall.`,
      );
      return;
    }
    if (price < 0) {
      errors.push(`Rad ${rowNumber}: prisen kan ikke være negativ.`);
      return;
    }

    rows.push({
      name,
      unit,
      unit_price: price,
      code: mapping.columns.code ? text(row.getCell(mapping.columns.code)) || null : null,
      description: mapping.columns.description
        ? text(row.getCell(mapping.columns.description)) || null
        : null,
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push("Fant ingen rader med innhold under overskriftene.");
  }

  return { rows, errors, skipped };
}

type Mapping =
  | { columns: Record<"name" | "unit" | "unit_price", number> & Partial<Record<"code" | "description", number>> }
  | { error: string };

function mapHeaders(headerRow: ExcelJS.Row): Mapping {
  const found: Partial<Record<ColumnKey, number>> = {};

  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const normalized = normalize(text(cell));
    if (!normalized) return;
    for (const key of COLUMN_ORDER) {
      if (found[key]) continue;
      if (COLUMNS[key].aliases.includes(normalized)) {
        found[key] = columnNumber;
        return;
      }
    }
  });

  const missing = (["name", "unit", "unit_price"] as const).filter((key) => !found[key]);
  if (missing.length > 0) {
    return {
      error:
        `Fant ikke kolonnen ${missing.map((key) => `«${COLUMNS[key].header}»`).join(" og ")} ` +
        "i første rad. Last ned malen og bruk overskriftene derfra.",
    };
  }

  return {
    columns: {
      name: found.name!,
      unit: found.unit!,
      unit_price: found.unit_price!,
      code: found.code,
      description: found.description,
    },
  };
}

/**
 * Leter etter sammenslåtte celler i kolonnene vi faktisk leser.
 *
 * Sammenslåinger utenfor disse — en tittelrad over overskriftene, en notis
 * ute til høyre — får stå i fred. Det er bare de som overlapper data vi
 * importerer, som kan gi feil priser.
 */
function mergeProblem(
  sheet: ExcelJS.Worksheet,
  columns: Record<string, number | undefined>,
): string | null {
  const merges: string[] = sheet.model?.merges ?? [];
  if (merges.length === 0) return null;

  const lest = new Set(
    Object.values(columns).filter((n): n is number => typeof n === "number"),
  );
  const rammet: string[] = [];

  for (const range of merges) {
    const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
    if (!match) continue;
    const [, fraKol, fraRad, tilKol, tilRad] = match;
    const kolFra = colToNumber(fraKol);
    const kolTil = colToNumber(tilKol);
    const radTil = Number(tilRad);

    // Bare datarader (2 og nedover), og bare kolonner vi leser.
    if (radTil < 2) continue;
    let treffer = false;
    for (let kol = kolFra; kol <= kolTil; kol++) {
      if (lest.has(kol)) treffer = true;
    }
    if (treffer) rammet.push(range);
  }

  if (rammet.length === 0) return null;

  const vist = rammet.slice(0, 6).join(", ");
  return (
    `Filen har sammenslåtte celler (${vist}${rammet.length > 6 ? `, og ${rammet.length - 6} til` : ""}). ` +
    "Excel gir samme verdi til alle radene i en sammenslåing, så prisene ville blitt " +
    "importert feil uten at noe så galt ut. Marker alt i arket og slå av «Slå sammen " +
    "og midtstill», eller lim inn på nytt med «Lim inn spesial → Verdier» — da følger " +
    "verken sammenslåinger eller annen formatering med."
  );
}

/** «A» → 1, «D» → 4, «AA» → 27. */
function colToNumber(letters: string): number {
  let n = 0;
  for (const letter of letters) n = n * 26 + (letter.charCodeAt(0) - 64);
  return n;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .trim();
}

/** Celleverdier fra Excel kan være formler, rik tekst eller rene verdier. */
function text(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("result" in value && value.result !== undefined) {
      return String(value.result).trim();
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
  }
  return String(value).trim();
}

/**
 * Godtar «1 190», «1.190,50», «1190,50 kr» og «kr 1 190» — folk limer inn
 * priser i alle disse formene, og å avvise dem ville bare skape arbeid.
 */
function toNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return null;

  let raw = String(
    typeof value === "object" && value !== null && "result" in value
      ? value.result
      : value,
  );

  raw = raw
    .replace(/kr|nok/gi, "")
    .replace(/\s| /g, "")
    .trim();
  if (!raw) return null;

  // Tusenskille og desimalskille varierer. Siste separator vinner som desimal.
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma > lastDot) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    raw = raw.replace(/,/g, "");
  } else {
    raw = raw.replace(/[.,]/g, "");
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
