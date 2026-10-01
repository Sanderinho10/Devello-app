import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { hentOrdreForApp } from "@/lib/app/lese";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Én ordre med timer, materiell, notat og bilder — alt appen viser på ordresiden. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const ordre = await hentOrdreForApp(admin, session.companyId, id);
    if (!ordre) return NextResponse.json({ error: "Fant ikke ordren" }, { status: 404 });
    return NextResponse.json(ordre);
  } catch (err) {
    return errorResponse(err);
  }
}
