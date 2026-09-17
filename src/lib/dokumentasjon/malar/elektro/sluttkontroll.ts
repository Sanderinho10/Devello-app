import type { Mal } from "../typar";

/**
 * Rapport fra sluttkontroll — FEL § 12, NEK 400 del 6.
 *
 * Strukturen følger DSBs veiledning til sluttkontroll: visuell kontroll
 * punkt for punkt, deretter måling og prøving med kravene i klartekst.
 * Kravene under er referanser montøren skal kjenne — de er ikke fasit for
 * alle anlegg, og feltet «limit» sier hvor kravet står.
 */
export const sluttkontroll: Mal = {
  key: "elektro.sluttkontroll",
  version: 1,
  fag: "elektro",
  title: "Rapport fra sluttkontroll",
  lovgrunnlag: "FEL § 12, NEK 400",
  beskrivelse: "Visuell kontroll, måling og prøving før anlegget tas i bruk. Fyll ut punkt for punkt.",
  boligmappa: { chapterTagName: "Samsvarserklæringer og garantibevis", documentTypeName: "Sluttkontroll" },
  signature: { required: true, label: "Kontrollen utført av" },
  sections: [
    {
      key: "anlegg",
      title: "Anlegg",
      fields: [
        { key: "anleggsadresse", label: "Anleggsadresse", type: "text", prefill: "order.site_address", required: true },
        { key: "eier", label: "Eier / kunde", type: "text", prefill: "order.customer_name", required: true },
        { key: "ordrenr", label: "Ordrenummer", type: "text", prefill: "order.order_no" },
        { key: "omfang", label: "Kontrollen omfatter", type: "textarea", prefill: "order.description", required: true },
        {
          key: "fordelingssystem",
          label: "Fordelingssystem",
          type: "select",
          required: true,
          options: [
            { value: "TN-C-S", label: "TN-C-S" },
            { value: "TN-S", label: "TN-S" },
            { value: "IT", label: "IT" },
            { value: "TT", label: "TT" },
          ],
        },
      ],
    },
    {
      key: "visuell",
      title: "Visuell kontroll",
      help: "OK = i orden. Avvik = må utbedres, beskriv under. Ikke aktuelt = punktet gjelder ikke dette arbeidet.",
      fields: [
        { key: "v_utstyr", label: "Utstyr egnet for bruk og omgivelser (IP, temperatur, mekanisk)", type: "check3", required: true },
        { key: "v_kabel", label: "Kabelframføring, feste og beskyttelse", type: "check3", required: true },
        { key: "v_kapsling", label: "Kapslingsgrad opprettholdt (gjennomføringer, lokk, tetninger)", type: "check3", required: true },
        { key: "v_jording", label: "Jording og utjevningsforbindelser", type: "check3", required: true },
        { key: "v_skille", label: "Skille mellom jordet og ujordet område", type: "check3", required: true },
        { key: "v_branntetting", label: "Branntetting av gjennomføringer i brannskiller", type: "check3", required: true },
        { key: "v_leder_vern", label: "Samsvar mellom leder og vern (tverrsnitt og In)", type: "check3", required: true },
        { key: "v_innstilling", label: "Innstilling av justerbare vern", type: "check3", required: true },
        { key: "v_jordfeilvern", label: "Jordfeilvern: riktig type og utløsestrøm", type: "check3", required: true },
        { key: "v_frakopling", label: "Frakoplingsutstyr og nødstopp der det kreves", type: "check3", required: true },
        { key: "v_merking_ledere", label: "Merking av ledere (N, PE, faser)", type: "check3", required: true },
        { key: "v_tilkoplinger", label: "Tilkoplinger: tiltrekking og kontakt", type: "check3", required: true },
        { key: "v_skjult_varme", label: "Dokumentasjon av skjult varme (varmekabel, folie)", type: "check3", required: true },
        { key: "v_skilt", label: "Informasjonsskilt og advarselsmerking", type: "check3", required: true },
        { key: "v_overspenningsvern", label: "Overspenningsvern montert og fungerende", type: "check3", required: true },
        { key: "v_pe_merking", label: "Merking av vernejordleder (gul/grønn)", type: "check3", required: true },
        { key: "v_tilgjenge", label: "Tilgjengelighet for drift og vedlikehold", type: "check3", required: true },
        { key: "v_underlag", label: "Samsvar med underlag (tegninger, risikovurdering)", type: "check3", required: true },
        { key: "visuell_avvik", label: "Beskrivelse av avvik fra visuell kontroll", type: "textarea" },
      ],
    },
    {
      key: "maaling",
      title: "Måling og prøving",
      help: "Kravet står ved siden av hvert felt. Måles per kurs, skriv verdien for den dårligste kursen og noter hvilken.",
      fields: [
        { key: "m_kontinuitet", label: "Kontinuitet i vernejordleder (200 mA prøvestrøm)", type: "measure", unit: "Ω", limit: "Lav og stabil; typisk < 1 Ω. NEK 400-6 6.4.3.2", required: true },
        { key: "m_isolasjon", label: "Isolasjonsresistans", type: "measure", unit: "MΩ", limit: "≥ 1 MΩ ved 500 V DC for 230/400 V. NEK 400-6 tabell 6A", required: true },
        { key: "m_isolasjon_kurs", label: "Isolasjonsresistans målt på", type: "text", help: "Per kurs eller samlet — skriv hvilken." },
        { key: "m_jordelektrode", label: "Overgangsresistans jordelektrode", type: "measure", unit: "Ω", limit: "Iht. NEK 400-4-41 for valgt system; ikke relevant i TN med PEN fra nett" },
        { key: "m_ik_min", label: "Minste kortslutningsstrøm Ik min", type: "measure", unit: "A", limit: "Ik min > I5 (5×In for B, 10×In for C). NEK 400-4-43", required: true },
        { key: "m_utkoplingstid", label: "Utkoplingstid ved jordfeil", type: "measure", unit: "ms", limit: "≤ 400 ms i TN 230 V sluttkurser ≤ 32 A; ≤ 300 ms med jordfeilvern. NEK 400-4-41", required: true },
        { key: "m_spenningsfall", label: "Spenningsfall", type: "measure", unit: "%", limit: "≤ 4 % for belysning, ≤ 5 % annet, fra tilknytning. NEK 400-5-52" },
        { key: "m_jordfeilvern", label: "Jordfeilvern prøvd (testknapp og instrument)", type: "check3", required: true },
        { key: "m_polaritet", label: "Polaritetskontroll (TN)", type: "check3", required: true },
        { key: "m_funksjon", label: "Funksjonsprøve av anlegg og utstyr", type: "check3", required: true },
        { key: "m_ovsp_signal", label: "Overspenningsvern: signal / indikator OK", type: "check3", required: true },
        { key: "maaling_merknad", label: "Merknad til målingene", type: "textarea" },
      ],
    },
    {
      key: "instrument",
      title: "Instrument og konklusjon",
      fields: [
        { key: "instrument_type", label: "Instrument (type)", type: "text", required: true },
        { key: "instrument_serienr", label: "Serienummer", type: "text", required: true },
        { key: "instrument_kalibrert", label: "Sist kalibrert", type: "date" },
        {
          key: "konklusjon",
          label: "Konklusjon",
          type: "select",
          required: true,
          options: [
            { value: "godkjent", label: "Godkjent — ingen avvik" },
            { value: "avvik_utbedret", label: "Avvik funnet og utbedret" },
            { value: "avvik_staar", label: "Avvik står igjen — frist under" },
          ],
        },
        { key: "avvik_frist", label: "Frist for utbedring av gjenstående avvik", type: "date" },
        { key: "avvik_beskrivelse", label: "Gjenstående avvik", type: "textarea" },
        { key: "dato", label: "Dato for kontrollen", type: "date", prefill: "today", required: true },
        { key: "utfort_av", label: "Utført av", type: "text", prefill: "user.name", required: true },
      ],
    },
  ],
};
