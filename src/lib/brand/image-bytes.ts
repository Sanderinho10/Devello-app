import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Henter et merkevarebilde ut av lagringen som bytes.
 *
 * Feiler nedlastingen, får kallende kode null og lager e-posten eller PDF-en
 * uten bildet. Et tilbud uten logo er greit; et tilbud som ikke ble laget
 * fordi et bilde manglet, er det ikke.
 */
export async function brandImageBytes(
  admin: SupabaseClient,
  path: string | null | undefined,
): Promise<{ bytes: Buffer; contentType: string; fileName: string } | null> {
  if (!path) return null;

  try {
    const { data, error } = await admin.storage.from("brand-logos").download(path);
    if (error || !data) return null;

    return {
      bytes: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || "image/png",
      fileName: path.split("/").pop() ?? "signatur.png",
    };
  } catch {
    return null;
  }
}
