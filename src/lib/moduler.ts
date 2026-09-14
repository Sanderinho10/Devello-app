/**
 * Modulene et selskap har.
 *
 * Modulene er produktpakker: tilbud selges alene i dag, ordre kommer som
 * egen pakke. Hva et selskap har, står i companies.moduler og settes av
 * Devello for hånd inntil ordre-pakken er priset. Når den er det, skal denne
 * hjelperen også se på subscriptions — men ikke nå. Da får vi ett sted å
 * endre, og verken sidemenyen eller API-rutene trenger å vite hvor svaret
 * kommer fra.
 */

export type ModulId = "tilbud" | "ordre";

export function harModul(
  moduler: string[] | null | undefined,
  id: ModulId,
): boolean {
  return Array.isArray(moduler) && moduler.includes(id);
}
