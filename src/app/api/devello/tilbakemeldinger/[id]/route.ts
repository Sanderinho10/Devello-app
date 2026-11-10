import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { develloAdminEllers403 } from "@/lib/devello-admin";
import { supabaseAdmin } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** `{ behandlet: true | false }` markerer en tilbakemelding som tatt hånd om, eller angrer. Bare for Devello. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await sessionOr401({ utenAbonnement: true });
  if (session instanceof NextResponse) return session;
  const nei = develloAdminEllers403(session);
  if (nei) return nei;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { behandlet?: unknown };
    if (typeof body.behandlet !== "boolean") {
      return NextResponse.json({ error: "Mangler behandlet: true eller false." }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin()
      .from("devello_tilbakemeldinger")
      .update({ behandlet_at: body.behandlet ? new Date().toISOString() : null })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Fant ikke tilbakemeldingen." }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
