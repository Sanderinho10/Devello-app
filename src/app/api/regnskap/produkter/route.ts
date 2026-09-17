import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { pogoClient, type PogoKopling } from "@/lib/regnskap/poweroffice";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Produktene i regnskapssystemet, til produktmappingen. */
export async function GET() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const { data: kopling } = await admin
      .from("accounting_connections")
      .select("id, provider, environment, client_key")
      .eq("company_id", session.companyId)
      .neq("status", "kopla_fra")
      .maybeSingle();
    if (!kopling) return NextResponse.json({ error: "Ingen regnskapssystem er koblet til." }, { status: 400 });
    if (kopling.provider !== "poweroffice") return NextResponse.json({ error: "Bare PowerOffice Go er støttet ennå." }, { status: 400 });

    const produkter = await pogoClient(kopling as PogoKopling).hentProdukter();
    return NextResponse.json({
      produkter: produkter
        .filter((p) => p.Code)
        .map((p) => ({ code: p.Code, name: p.Name ?? p.Code }))
        .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "", "nb")),
    });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
