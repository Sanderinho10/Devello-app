import { NextResponse, type NextRequest } from "next/server";
import { sessionOr401 } from "@/lib/api";
import { buildTemplate, templateFileName } from "@/lib/pricelist/excel";
import type { PriceItemKind } from "@/lib/types";

const KINDS: PriceItemKind[] = ["punktpris", "materiell", "time"];

/** Laster ned Excel-malen for en listetype. */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const kind = request.nextUrl.searchParams.get("kind") as PriceItemKind | null;
  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "Ukjent listetype" }, { status: 400 });
  }

  const workbook = await buildTemplate(kind);

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${templateFileName(kind)}"`,
      "Cache-Control": "no-store",
    },
  });
}
