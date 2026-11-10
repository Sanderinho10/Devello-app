import { redirect } from "next/navigation";

/**
 * Den gamle samlesiden. Innstillingene har nå ett punkt hver; gamle lenker
 * og bokmerker sendes dit de hører hjemme.
 */
export default async function GenereltPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
  if (sp.bm_koblet || sp.bm_feil) redirect(`/selskap/innstillinger/boligmappa?${q}`);
  if (sp.koblet || sp.feil) redirect(`/selskap/innstillinger/postkasse?${q}`);
  redirect("/selskap/innstillinger/firma");
}
