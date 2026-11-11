import type { QueryClient } from "@tanstack/react-query";

/**
 * Nettleserutgaven av push: ingen push. Bare til forhåndsvisning under
 * utvikling (npm run web) — varsel-lista virker som i appen.
 */
export type PushStatus = "paa" | "ikke_spurt" | "avslaatt" | "utilgjengelig";

export function usePushStatus(): PushStatus {
  return "utilgjengelig";
}
export async function oppdaterPush(): Promise<void> {}
export async function slaaPaaPush(): Promise<PushStatus> {
  return "utilgjengelig";
}
export async function avregistrerPush(): Promise<void> {}
export function settMerke(_ulest: number) {}
export function lyttPaaPush(_qc: QueryClient, _gaaTil: (sti: string) => void): () => void {
  return () => {};
}
