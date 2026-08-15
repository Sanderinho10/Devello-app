import { redirect } from "next/navigation";

/**
 * /tilbud er ingen side i seg selv — agenten har bare faner.
 *
 * Uten denne gir adressen 404, og det ser ut som appen er ødelagt for den som
 * klipper av URL-en eller skriver den fra hukommelsen. Send dem til første fane.
 */
export default function TilbudPage() {
  redirect("/tilbud/leads");
}
