import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Ny grossist: navn og kundenummer. Katalogen kommer med første import. */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const body = (await request.json().catch(() => ({}))) as { name?: unknown; customer_no?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) return NextResponse.json({ error: "Grossisten må ha et navn." }, { status: 400 });
    const customerNo = typeof body.customer_no === "string" && body.customer_no.trim() ? body.customer_no.trim().slice(0, 40) : null;

    const { data, error } = await admin
      .from("suppliers")
      .insert({ company_id: session.companyId, name, customer_no: customerNo })
      .select("*")
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ error: `«${name}» finnes fra før.` }, { status: 409 });
      }
      throw new Error(error.message);
    }
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
