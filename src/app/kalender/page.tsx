import { Kalender } from "./Kalender";

export const dynamic = "force-dynamic";

/** /kalender?uke=2026-11-09 opnar veka datoen ligg i. */
export default async function KalenderSide({ searchParams }: { searchParams: Promise<{ uke?: string }> }) {
  const { uke } = await searchParams;
  return <Kalender startDato={uke && /^\d{4}-\d{2}-\d{2}$/.test(uke) ? uke : null} />;
}
