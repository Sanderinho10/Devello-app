import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Logoen som data-URI, klar til å bygges rett inn i PDF-en.
 *
 * Chromium henter aldri noe utenfra mens en PDF lages. Det er med vilje: en
 * lenke ville krevd at bildet lå offentlig tilgjengelig, og en PDF som er
 * avhengig av at en server svarer i akkurat det sekundet, er en PDF som
 * før eller siden kommer ut uten logo.
 *
 * Feiler nedlastingen, faller PDF-en tilbake til firmanavn i tekst. Et tilbud
 * uten logo er greit; et tilbud som ikke ble laget, er det ikke.
 */
export async function logoDataUri(
  admin: SupabaseClient,
  logoPath: string | null | undefined,
): Promise<string | null> {
  if (!logoPath) return null;

  try {
    const { data, error } = await admin.storage.from("brand-logos").download(logoPath);
    if (error || !data) return null;

    const bytes = Buffer.from(await data.arrayBuffer());
    const type = data.type || guessType(logoPath);
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function guessType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "image/png";
}
