import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { grossistForSkriving } from "@/lib/grossist/api";
import { BUCKET, paagaaandeJobb } from "@/lib/grossist/jobb";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Endre navn og kundenummer på en grossist (PATCH) eller slett den (DELETE).
 * Bare administratorer, som opprettingen. Katalogen og FTP-oppsettet har
 * sine egne ruter.
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

/**
 * Slett en grossist. Bare administratorer.
 *
 * Databasen tar resten: katalogen, FTP-oppsettet, importjobbene og
 * fakturafil-loggen slettes med grossisten. Materiell på ordrer og
 * leverandørfakturaer blir stående — de har egne kopier av varenummer,
 * navn og pris, og mister bare koblingen til katalogen.
 * Opplastede prisfiler ryddes fra Storage; fakturafiler blir liggende,
 * fordi fakturaene som ble lest fra dem fortsatt finnes.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ supplierId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const { supplierId } = await params;
    const admin = supabaseAdmin();
    const g = await grossistForSkriving(admin, session, supplierId);
    if (g instanceof NextResponse) return g;

    if (await paagaaandeJobb(admin, g.id)) {
      return NextResponse.json({ error: "En import kjører for denne grossisten. Vent til den er ferdig." }, { status: 409 });
    }

    const { error } = await admin.from("suppliers").delete().eq("id", g.id).eq("company_id", session.companyId);
    if (error) throw new Error(error.message);

    // Prisfilene ligger under <selskap>/<grossist>/<jobb>/<fil>. Feil her
    // stopper ikke slettingen — grossisten er alt borte.
    await ryddPrisfiler(admin, `${session.companyId}/${g.id}`).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

async function ryddPrisfiler(admin: ReturnType<typeof supabaseAdmin>, rot: string): Promise<void> {
  const { data: mapper } = await admin.storage.from(BUCKET).list(rot, { limit: 1000 });
  const stier: string[] = [];
  for (const m of mapper ?? []) {
    // Mapper har ingen id i Storage-listingen; filer har.
    if (m.id) {
      stier.push(`${rot}/${m.name}`);
      continue;
    }
    const { data: filer } = await admin.storage.from(BUCKET).list(`${rot}/${m.name}`, { limit: 1000 });
    for (const f of filer ?? []) stier.push(`${rot}/${m.name}/${f.name}`);
  }
  for (let i = 0; i < stier.length; i += 100) {
    await admin.storage.from(BUCKET).remove(stier.slice(i, i + 100));
  }
}
