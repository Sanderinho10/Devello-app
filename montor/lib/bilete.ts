import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { nyClientId } from "./utboks/db";

/**
 * Bilder til utboksen: komprimeres (maks 1600 px lengste side, JPEG 0,75)
 * og legges i documentDirectory/utboks/ før noe annet skjer. Aldri bare i
 * minnet, aldri i full størrelse.
 */

const MAKS_SIDE = 1600;
const KVALITET = 0.75;

export interface LagretBilete {
  uri: string;
  filnavn: string;
  mime: "image/jpeg";
}

function utboksMappe(): Directory {
  const mappe = new Directory(Paths.document, "utboks");
  if (!mappe.exists) mappe.create({ intermediates: true, idempotent: true });
  return mappe;
}

export async function komprimerOgLagre(uri: string, bredde?: number, hoyde?: number): Promise<LagretBilete> {
  const ctx = ImageManipulator.manipulate(uri);
  if (bredde && hoyde && Math.max(bredde, hoyde) > MAKS_SIDE) {
    ctx.resize(bredde >= hoyde ? { width: MAKS_SIDE } : { height: MAKS_SIDE });
  } else if (!bredde || !hoyde) {
    // Ukjent størrelse: skaler ned bredden, høyden følger med.
    ctx.resize({ width: MAKS_SIDE });
  }
  const bilde = await ctx.renderAsync();
  const resultat = await bilde.saveAsync({ compress: KVALITET, format: SaveFormat.JPEG });
  bilde.release();

  const filnavn = `${nyClientId()}.jpg`;
  const maal = new File(utboksMappe(), filnavn);
  await new File(resultat.uri).move(maal);
  return { uri: maal.uri, filnavn, mime: "image/jpeg" };
}

export function slettLokalt(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Alt borte.
  }
}
