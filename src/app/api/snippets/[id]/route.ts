import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { lesSnippet } from "@/lib/ordre/snippets";
import { supabaseAdmin } from "@/lib/supabase/server";

/** PATCH { name, text } retter en snippet, DELETE fjerner den. Tekst som alt er satt inn i en ordre, står. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const felt = lesSnippet(await request.json().catch(() => ({})));
    if ("error" in felt) return NextResponse.json({ error: felt.error }, { status: 400 });

    const { data, error } = await admin
      .from("order_snippets")
      .update({ name: felt.name, text: felt.text })
      .eq("id", id)
      .eq("company_id", session.companyId)
      .select("id, name, text, created_by, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Fant ikke snippeten." }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    const { error } = await admin.from("order_snippets").delete().eq("id", id).eq("company_id", session.companyId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
