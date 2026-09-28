import { notFound } from "next/navigation";
import { NotatFane } from "./NotatFane";
import { hentOrdre } from "@/lib/ordre/hent";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { OrderNote } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Notatene på ordren — skrevet i montørappen, med bilder fra jobben.
 * Bare lesing og sletting her; notat skrives i appen.
 */
export default async function NotatSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ordre = await hentOrdre(id);
  if (!ordre) notFound();

  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: notat }, { data: bilete }, { data: medlemmer }, { data: meg }] = await Promise.all([
    supabase.from("order_notes").select("*").eq("order_id", ordre.id).order("created_at", { ascending: false }),
    supabase
      .from("order_documents")
      .select("id, title, file_name, note_id, mime_type")
      .eq("order_id", ordre.id)
      .eq("kind", "fil")
      .not("note_id", "is", null)
      .order("created_at", { ascending: true }),
    supabase.from("users").select("id, full_name, email").eq("company_id", session!.companyId),
    supabase.from("users").select("role").eq("id", session!.userId).maybeSingle(),
  ]);

  const namn = new Map((medlemmer ?? []).map((u) => [u.id as string, (u.full_name as string | null) || (u.email as string)]));

  return (
    <NotatFane
      orderId={ordre.id}
      userId={session!.userId}
      erAdmin={meg?.role === "admin"}
      notat={((notat ?? []) as OrderNote[]).map((n) => ({
        ...n,
        user_name: namn.get(n.user_id) ?? "",
        bilete: (bilete ?? [])
          .filter((b) => b.note_id === n.id && (b.mime_type ?? "").startsWith("image/"))
          .map((b) => ({ id: b.id as string, title: b.title as string })),
      }))}
    />
  );
}
