import { redirect } from "next/navigation";

/** Selskap er ingen side i seg selv — bare faner. Send videre til første. */
export default function SelskapPage() {
  redirect("/selskap/abonnement");
}
