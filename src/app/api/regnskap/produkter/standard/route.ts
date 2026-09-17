import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { pogoClient, type PogoKopling } from "@/lib/regnskap/poweroffice";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ProductMap, ProductMapKey } from "@/lib/types";

/**
 * Oppretter Devellos standardprodukter i regnskapssystemet og skriver
 * mappingen. Finnes koden fra før, brukes den som den er. Salgskonto og
 * mva-kode settes ikke herfra — de må sjekkes i Go før første faktura, og
 * svaret sier det.
 */
const STANDARD: { key: ProductMapKey; code: string; name: string; description: string }[] = [
  { key: "arbeid", code: "DEV-ARB", name: "Arbeid", description: "Timer fra Devello-ordre" },
  { key: "materiell", code: "DEV-MAT", name: "Materiell", description: "Materiell fra Devello-ordre" },
  { key: "fastpris", code: "DEV-FAST", name: "Fastpris iht. tilbud", description: "Fastpris eller punktpris iht. tilbud, fra Devello-ordre" },
  { key: "annet", code: "DEV-ANN", name: "Annet", description: "Andre linjer fra Devello-ordre" },
];

export async function POST() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const { data: kopling } = await admin
      .from("accounting_connections")
      .select("id, provider, environment, client_key, product_map")
      .eq("company_id", session.companyId)
      .neq("status", "kopla_fra")
      .maybeSingle();
    if (!kopling) return NextResponse.json({ error: "Ingen regnskapssystem er koblet til." }, { status: 400 });
    if (kopling.provider !== "poweroffice") return NextResponse.json({ error: "Bare PowerOffice Go er støttet ennå." }, { status: 400 });

    const pogo = pogoClient(kopling as PogoKopling);
    const finst = new Set((await pogo.hentProdukter()).map((p) => p.Code).filter(Boolean));
    const oppretta: string[] = [];
    for (const p of STANDARD) {
      if (finst.has(p.code)) continue;
      await pogo.opprettProdukt({ Code: p.code, Name: p.name, Description: p.description });
      oppretta.push(p.code);
    }

    const map: ProductMap = { ...((kopling.product_map as ProductMap) ?? {}) };
    for (const p of STANDARD) map[p.key] = p.code;
    const { error } = await admin.from("accounting_connections").update({ product_map: map }).eq("id", kopling.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      product_map: map,
      oppretta,
      melding:
        (oppretta.length ? `Opprettet ${oppretta.join(", ")} i PowerOffice Go. ` : "Produktene fantes fra før. ") +
        "Sjekk salgskonto og mva-kode på produktene i Go før første faktura.",
    });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
