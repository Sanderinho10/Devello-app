import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { grossistForSkriving } from "@/lib/grossist/api";
import { hentFakturafiler } from "@/lib/regnskap/ftp-faktura";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 300;

/** «Hent fakturaer nå» for én grossist: lister FTP-området og leser nye fakturafiler. Admin. */
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

    const { data: ftp } = await admin.from("supplier_ftp").select("fakturafil_pattern").eq("supplier_id", g.id).maybeSingle();
    if (!ftp) return NextResponse.json({ error: "Lagre FTP-oppsettet først." }, { status: 400 });
    if (!ftp.fakturafil_pattern) return NextResponse.json({ error: "Legg inn filmønster for fakturafiler først." }, { status: 400 });

    const resultat = await hentFakturafiler(admin, g.id, { trigger: "manuell" });
    return NextResponse.json(resultat);
  } catch (err) {
    return errorResponse(err);
  }
}
