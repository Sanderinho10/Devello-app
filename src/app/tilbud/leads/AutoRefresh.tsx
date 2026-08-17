"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Holder listen i takt mens agenten genererer i bakgrunnen.
 *
 * Serveren kan ikke dytte noe til nettleseren her, så listen spør selv — men
 * bare så lenge det faktisk står noe på «genererer». Er ingenting i arbeid,
 * gjør komponenten ingenting i det hele tatt.
 *
 * Fem sekunder er valgt for å kjennes umiddelbart uten å være en byrde: en
 * generering tar rundt et minutt, så det blir et titalls forespørsler per
 * utkast, ikke hundre.
 */
export function AutoRefresh({ aktiv }: { aktiv: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!aktiv) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [aktiv, router]);

  return null;
}
