import { NextResponse } from "next/server";
import { sessionOr401 } from "@/lib/api";
import { BUCKET } from "@/lib/regnskap/sync";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Selve leverandørfakturaen, slik den ligger i regnskapssystemet, til
 * visning i nettleseren.
 *
 * Bucketen er bare for service role; tilgangen avgjøres her, av selskapet
 * i sesjonen — ikke av at noen kjenner id-en.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: rad } = await admin
    .from("supplier_invoices")
    .select("invoice_no, voucher_no, pdf_storage_path")
    .eq("id", id)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!rad?.pdf_storage_path) {
    return NextResponse.json({ error: "Fakturaen har ingen PDF." }, { status: 404 });
  }

  const { data: blob } = await admin.storage.from(BUCKET).download(rad.pdf_storage_path);
  if (!blob) return NextResponse.json({ error: "Filen mangler" }, { status: 404 });

  const navn = `faktura-${rad.invoice_no ?? rad.voucher_no ?? id}.pdf`;
  return new NextResponse(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(navn)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
