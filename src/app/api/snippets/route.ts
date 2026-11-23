import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { lesSnippet } from "@/lib/ordre/snippets";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Snippets: ferdige tekster som settes inn i beskrivelsen på en ordre.
 *
 * GET gir alle i selskapet, alfabetisk. POST lager en ny — alle i selskapet
 * kan det, for poenget er at det skal være lett å lage en når man står og
 * skriver den samme teksten for tredje gang.
 */
export async function GET() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    const { data, error } = await admin
      .from("order_snippets")
      .select("id, name, text, created_by, updated_at")
      .eq("company_id", session.companyId)
      .order("name");
    if (error) throw new Error(error.message);
    return NextResponse.json({ snippets: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const felt = lesSnippet(await request.json().catch(() => ({})));
    if ("error" in felt) return NextResponse.json({ error: felt.error }, { status: 400 });

    const { data, error } = await admin
      .from("order_snippets")
      .insert({ company_id: session.companyId, name: felt.name, text: felt.text, created_by: session.userId })
      .select("id, name, text, created_by, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
