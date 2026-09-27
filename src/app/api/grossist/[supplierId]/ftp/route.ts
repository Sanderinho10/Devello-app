import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { grossistForSkriving, utanPassord } from "@/lib/grossist/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * FTP-oppsettet for en grossist. Bare administratorer.
 * Tomt passord = behold det gamle. Svaret har aldri passordet med.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ supplierId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const { supplierId } = await params;
    const admin = supabaseAdmin();
    const g = await grossistForSkriving(admin, session, supplierId);
    if (g instanceof NextResponse) return g;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const protocol = body.protocol === "ftp" || body.protocol === "sftp" ? body.protocol : "ftps";
    const host = typeof body.host === "string" ? body.host.trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "").slice(0, 200) : "";
    if (!host) return NextResponse.json({ error: "Vert mangler." }, { status: 400 });
    const portRaa = body.port === "" || body.port === null || body.port === undefined ? null : Number(body.port);
    if (portRaa !== null && (!Number.isInteger(portRaa) || portRaa < 1 || portRaa > 65535)) {
      return NextResponse.json({ error: "Ugyldig port." }, { status: 400 });
    }
    const username = typeof body.username === "string" ? body.username.trim().slice(0, 200) : "";
    if (!username) return NextResponse.json({ error: "Brukernavn mangler." }, { status: 400 });
    const password = typeof body.password === "string" ? body.password : "";
    const remotePath = typeof body.remote_path === "string" && body.remote_path.trim() ? body.remote_path.trim().slice(0, 300) : "/";
    const varefil = typeof body.varefil_pattern === "string" && body.varefil_pattern.trim() ? body.varefil_pattern.trim().slice(0, 100) : "V4*";
    const rabattfil = typeof body.rabattfil_pattern === "string" ? body.rabattfil_pattern.trim().slice(0, 100) || null : "R4*";
    const autoImport = body.auto_import === undefined ? true : Boolean(body.auto_import);

    const { data: finst } = await admin.from("supplier_ftp").select("supplier_id").eq("supplier_id", g.id).maybeSingle();
    if (!finst && !password) return NextResponse.json({ error: "Passord mangler." }, { status: 400 });

    const felt: Record<string, unknown> = {
      supplier_id: g.id,
      company_id: session.companyId,
      protocol,
      host,
      port: portRaa,
      username,
      remote_path: remotePath,
      varefil_pattern: varefil,
      rabattfil_pattern: rabattfil,
      auto_import: autoImport,
    };
    if (password) felt.password = password;

    const { data, error } = finst
      ? await admin.from("supplier_ftp").update(felt).eq("supplier_id", g.id).select("*").single()
      : await admin.from("supplier_ftp").insert(felt).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json(utanPassord(data));
  } catch (err) {
    return errorResponse(err);
  }
}

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
    const { error } = await admin.from("supplier_ftp").delete().eq("supplier_id", g.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
