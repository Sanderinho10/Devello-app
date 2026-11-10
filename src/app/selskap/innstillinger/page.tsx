import { redirect } from "next/navigation";

/** Innstillinger er ingen side i seg selv — første punkt i menyen. */
export default function InnstillingerPage() {
  redirect("/selskap/innstillinger/firma");
}
