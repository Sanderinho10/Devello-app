import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { grossistForSkriving } from "@/lib/grossist/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Endre navn og kundenummer på en grossist. Bare administratorer, som
 * opprettingen. Katalogen og FTP-oppsettet har sine egne ruter.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ supplierId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const { supplierId } = await params;
    const admin = supabaseAdmin();
    const g = await grossistForSkriving(admin, session, supplierId);
    if (g instanceof NextResponse) return g;

    const body = (await request.json().catch(() => ({}))) as { name?: unknown; customer_no?: unknown };
    const endringer: { name?: string; customer_no?: string | null } = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      if (!name) return NextResponse.json({ error: "Grossisten må ha et navn." }, { status: 400 });
      endringer.name = name;
    }
    if (body.customer_no !== undefined) {
      endringer.customer_no =
        typeof body.customer_no === "string" && body.customer_no.trim() ? body.customer_no.trim().slice(0, 40) : null;
    }
    if (Object.keys(endringer).length === 0) return NextResponse.json(g);

    const { data, error } = await admin
      .from("suppliers")
      .update(endringer)
      .eq("id", g.id)
      .eq("company_id", session.companyId)
      .select("*")
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ error: `«${endringer.name}» finnes fra før.` }, { status: 409 });
      }
      throw new Error(error.message);
    }
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
