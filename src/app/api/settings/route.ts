import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { erMotorVersjon } from "@/lib/claude/motor-versjon";
import { mergeToneSettings } from "@/lib/company/tone";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Innstillingene som hører til tilbudsagenten alene.
 *
 * Merkevare, adresse og målform ligger under Selskap: de gjelder hele
 * selskapet og skal ikke redigeres to steder. Her står bare det som former
 * dette ene tilbudet — bunnteksten i PDF-en, signaturen og tilleggsinstruksen.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json()) as {
      signatur?: string;
      tillegg?: string;
      footer_note?: string;
      /** "v2" | "v3" | "" — tom streng betyr standarden. */
      motor_versjon?: string;
    };
    const admin = supabaseAdmin();

    // Motoren er også agentens innstilling — det er den som former tilbudet
    // mer enn noe annet her. Tom streng = følg standarden (null i basen).
    if (body.motor_versjon !== undefined) {
      const valgt = body.motor_versjon === "" ? null : body.motor_versjon;
      if (valgt !== null && !erMotorVersjon(valgt)) {
        return NextResponse.json({ error: "Ukjent motorversjon." }, { status: 400 });
      }
      const { error: motorError } = await admin
        .from("companies")
        .update({ motor_versjon: valgt })
        .eq("id", session.companyId);
      if (motorError) throw new Error(motorError.message);
    }

    // Slås sammen, ikke overskrives: målform redigeres under Selskap, og et
    // lagre herfra skal ikke ta den med seg.
    const { error: companyError } = await mergeToneSettings(admin, session.companyId, {
      signatur: body.signatur || undefined,
      tillegg: body.tillegg || undefined,
    });
    if (companyError) throw new Error(companyError);

    const { error: brandError } = await admin.from("company_brand").upsert(
      { company_id: session.companyId, footer_note: body.footer_note || null },
      { onConflict: "company_id" },
    );
    if (brandError) throw new Error(brandError.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
