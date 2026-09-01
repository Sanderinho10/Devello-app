/**
 * Hvor mange referansefiler et selskap kan ha liggende.
 *
 * Grensen er ikke en kostnadsgrense. Genereringen henter maks fem referanser
 * per tilbud (sok_referanser), så fil nummer femti koster ikke mer per tilbud
 * enn fil nummer tjue — den blir bare sjeldnere valgt.
 *
 * Grensen finnes fordi utvalget er det som betyr noe. Tjue tilbud som dekker
 * hver sin jobbtype gir agenten noe å kjenne igjen; femti varianter av samme
 * punktprisjobb gir den bare flere måter å si det samme på, og gjør det
 * vanskeligere for firmaet å se hva som faktisk ligger inne. Taket tvinger
 * fram valget: skal en ny inn, må en gammel ut.
 */
export const MAKS_REFERANSEFILER = 20;
