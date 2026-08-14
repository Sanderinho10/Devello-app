import ExcelJS from "exceljs";
import {
  PRICE_KIND_LABELS,
  type PriceItemKind,
} from "@/lib/types";

/**
 * Excel-malen og innlesinga bur i same fil med vilje. Endrar ein kolonnane i
 * malen utan å endre innlesinga, får kunden ei fil som ikkje kan importerast —
 * og det er ein feil som ikkje viser seg før nokon prøver.
 */

interface ColumnSpec {
  /** Overskrifta som blir skriven i malen. */
  header: string;
  /** Alt vi godtek som denne kolonnen ved innlesing, normalisert. */
  aliases: string[];
  width: number;
  required: boolean;
}

const COLUMNS = {
  name: {
    header: "Namn",
    aliases: ["namn", "navn", "produkt", "produktnavn", "produktnamn", "post", "beskrivelse", "tekst", "name"],
    width: 42,
    required: true,
  },
  unit: {
    header: "Eining",
    aliases: ["eining", "enhet", "einheit", "unit", "mengde", "måleeining", "maaleeining"],
    width: 12,
    required: true,
  },
  unit_price: {
    header: "Pris eks. mva",
    aliases: ["pris eks. mva", "pris eks mva", "pris", "einingspris", "enhetspris", "kroner", "kr", "price", "sum"],
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
    header: "Skildring",
    aliases: ["skildring", "beskrivelse", "merknad", "kommentar", "notat", "description"],
    width: 40,
    required: false,
  },
} satisfies Record<string, ColumnSpec>;

type ColumnKey = keyof typeof COLUMNS;

const COLUMN_ORDER: ColumnKey[] = ["name", "unit", "unit_price", "code", "description"];

/** Eksempelrader per listetype, så malen viser kva som er venta. */
const EXAMPLES: Record<PriceItemKind, string[][]> = {
  punktpris: [
    ["Montering stikkontakt, dobbel", "stk", "890", "EL-104", "Standard dobbel kontakt i eksisterande vegg"],
    ["Montering takpunkt med brytar", "stk", "1340", "", ""],
    ["Montering varmekabel", "m²", "1150", "", "Inkl. kabel og termostat-tilkopling"],
  ],
  materiell: [
    ["Sikringsskap 24 modular", "stk", "4200", "M-2400", ""],
    ["Jordfeilautomat 16 A", "stk", "640", "", ""],
    ["Kabel PFSP 3G2,5", "m", "38", "", "Pris per meter"],
  ],
  time: [
    ["Timepris elektrikar", "time", "1190", "", "Ordinær arbeidstid"],
    ["Timepris lærling", "time", "760", "", ""],
    ["Køyring", "stk", "450", "", "Per oppdrag innanfor kommunen"],
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

  // Marker eksempelradene tydeleg, så dei ikkje blir importerte ved eit uhell.
  for (let rowNumber = 2; rowNumber <= 1 + EXAMPLES[kind].length; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    row.font = { italic: true, color: { argb: "FF86868B" } };
  }

  const note = sheet.getRow(2 + EXAMPLES[kind].length + 1);
  note.getCell(1).value =
    "↑ Radene over er eksempel. Slett dei og lim inn dine eigne. Namn, eining og pris må vere utfylt.";
  note.getCell(1).font = { italic: true, color: { argb: "FF86868B" }, size: 10 };

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
  /** Feil per rad. Er denne ikkje tom, blir ingenting importert. */
  errors: string[];
  /** Tomme rader vi hoppa over utan å klage. */
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
        "Klarte ikkje å lese fila. Er den lagra som .xlsx? Gamle .xls-filer må lagrast på nytt i nyare format.",
      ],
      skipped: 0,
    };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], errors: ["Arbeidsboka har ingen ark."], skipped: 0 };
  }

  const mapping = mapHeaders(sheet.getRow(1));
  if ("error" in mapping) {
    return { rows: [], errors: [mapping.error], skipped: 0 };
  }

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  let skipped = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const name = text(row.getCell(mapping.columns.name));
    const unit = text(row.getCell(mapping.columns.unit));
    const rawPrice = row.getCell(mapping.columns.unit_price).value;

    // Heilt tomme rader, og notatlinja i malen, går stille forbi.
    if (!name && !unit && (rawPrice === null || rawPrice === undefined || rawPrice === "")) {
      skipped += 1;
      return;
    }
    if (!name || !unit) {
      // Ei rad med berre tekst i fyrste kolonne er som regel ein kommentar.
      if (name && !unit && (rawPrice === null || rawPrice === undefined || rawPrice === "")) {
        skipped += 1;
        return;
      }
      errors.push(`Rad ${rowNumber}: namn og eining må vere utfylt.`);
      return;
    }

    const price = toNumber(rawPrice);
    if (price === null) {
      errors.push(
        `Rad ${rowNumber}: «${text(row.getCell(mapping.columns.unit_price))}» er ikkje eit tal.`,
      );
      return;
    }
    if (price < 0) {
      errors.push(`Rad ${rowNumber}: prisen kan ikkje vere negativ.`);
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
    errors.push("Fann ingen rader med innhald under overskriftene.");
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
        `Fann ikkje kolonnen ${missing.map((key) => `«${COLUMNS[key].header}»`).join(" og ")} ` +
        "i fyrste rad. Last ned malen og bruk overskriftene derifrå.",
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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .trim();
}

/** Celleverdiar frå Excel kan vere formlar, rike tekstar eller reine verdiar. */
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
 * Godtek «1 190», «1.190,50», «1190,50 kr» og «kr 1 190» — folk limer inn
 * prisar i alle desse formene, og å avvise dei ville berre skape arbeid.
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

  // Tusenskilje og desimalskilje varierer. Siste separator vinn som desimal.
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
