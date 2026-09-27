import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { grossistForSkriving } from "@/lib/grossist/api";
import { FtpFeil, listFiler, velNyaste, type FtpOppsett } from "@/lib/grossist/ftp";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 120;

/**
 * «Test tilkobling»: kobler til, lister katalogen, lagrer lista (uten
 * hemmeligheter) og sier hvilken fil hvert mønster ville hentet. Ingen import.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ supplierId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const { supplierId } = await params;
    const admin = supabaseAdmin();
    const g = await grossistForSkriving(admin, session, supplierId);
    if (g instanceof NextResponse) return g;

    const { data: rad } = await admin.from("supplier_ftp").select("*").eq("supplier_id", g.id).maybeSingle();
    if (!rad) return NextResponse.json({ error: "Lagre FTP-oppsettet først." }, { status: 400 });

    try {
      const filer = await listFiler(rad as FtpOppsett);
      const liste = filer
        .sort((a, b) => (b.mtime ?? "").localeCompare(a.mtime ?? "") || b.name.localeCompare(a.name))
        .slice(0, 200);
      await admin.from("supplier_ftp").update({ last_listing: liste }).eq("supplier_id", g.id);
      return NextResponse.json({
        filer: liste,
        villeHenta: {
          varefil: velNyaste(filer, rad.varefil_pattern)?.name ?? null,
          rabattfil: rad.rabattfil_pattern ? (velNyaste(filer, rad.rabattfil_pattern)?.name ?? null) : null,
        },
      });
    } catch (err) {
      if (err instanceof FtpFeil) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
