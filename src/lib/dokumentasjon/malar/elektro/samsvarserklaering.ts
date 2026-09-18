import type { Mal } from "../typar";

/**
 * Samsvarserklæring — FEL § 12.
 *
 * Installatørens erklæring om at anlegget er utført i samsvar med
 * sikkerhetskravene i forskriften. Eieren skal ha originalen; installatøren
 * oppbevarer kopi i minst fem år.
 */
export const samsvarserklaering: Mal = {
  key: "elektro.samsvarserklaering",
  version: 1,
  fag: "elektro",
  title: "Samsvarserklæring",
  lovgrunnlag: "FEL § 12",
  beskrivelse: "Erklæringen om at det utførte arbeidet er i samsvar med forskrift om elektriske lavspenningsanlegg.",
  boligmappa: { chapterTagName: "Samsvarserklæringer og garantibevis", documentTypeName: "Samsvarserklæring" },
  signature: { required: true, label: "Ansvarlig for arbeidet" },
  sections: [
    {
      key: "installator",
      title: "Installatør",
      fields: [
        { key: "firma", label: "Firma", type: "text", prefill: "company.name", required: true },
        { key: "org_nr", label: "Organisasjonsnummer", type: "text", prefill: "company.org_nr", required: true },
        { key: "firma_adresse", label: "Adresse", type: "text", prefill: "company.address" },
        { key: "faglig_ansvarlig", label: "Faglig ansvarlig", type: "text", required: true, help: "Den som er registrert som faglig ansvarlig i Elvirksomhetsregisteret." },
      ],
    },
    {
      key: "eier",
      title: "Eier og anlegg",
      fields: [
        { key: "eier", label: "Eier / kunde", type: "text", prefill: "order.customer_name", required: true },
        { key: "anleggsadresse", label: "Anleggsadresse", type: "text", prefill: "order.site_address", required: true },
        { key: "ordrenr", label: "Ordrenummer", type: "text", prefill: "order.order_no" },
        {
          key: "omfang",
          label: "Hva arbeidet omfatter",
          type: "textarea",
          prefill: "order.description",
          required: true,
          help: "Beskriv presist hva erklæringen gjelder. Anlegg eller deler som ikke er berørt, omfattes ikke.",
        },
        {
          key: "arbeidstype",
          label: "Type arbeid",
          type: "select",
          required: true,
          options: [
            { value: "nytt", label: "Nytt anlegg" },
            { value: "utvidelse", label: "Utvidelse av eksisterende anlegg" },
            { value: "endring", label: "Endring / utskifting" },
            { value: "reparasjon", label: "Reparasjon" },
          ],
        },
        { key: "ferdig_dato", label: "Arbeidet ferdigstilt", type: "date", required: true },
      ],
    },
    {
      key: "erklaering",
      title: "Erklæring",
      help: "Det erklæres herved at anlegget er utført i samsvar med sikkerhetskravene i forskrift om elektriske lavspenningsanlegg (FEL).",
      fields: [
        {
          key: "standard",
          label: "Anlegget er utført etter",
          type: "select",
          required: true,
          options: [
            { value: "NEK 400:2022", label: "NEK 400:2022" },
            { value: "NEK 400:2018", label: "NEK 400:2018" },
            { value: "annet", label: "Annen metode — beskrevet under" },
          ],
        },
        { key: "standard_annet", label: "Annen metode / avvik fra normen", type: "textarea", help: "Fylles bare når anlegget er utført etter annen dokumentert metode enn NEK 400." },
        { key: "risikovurdering_utfort", label: "Risikovurdering er utført og dokumentert (FEL § 16)", type: "checkbox", required: true },
        { key: "sluttkontroll_utfort", label: "Sluttkontroll er utført og dokumentert (FEL § 12)", type: "checkbox", required: true },
        { key: "kursfortegnelse_levert", label: "Kursfortegnelse er oppdatert og levert eier", type: "checkbox", required: true },
        { key: "utstyrsdok_levert", label: "Utstyrsdokumentasjon er levert eier (FEL § 36)", type: "checkbox", required: true },
        { key: "merknad", label: "Merknad", type: "textarea" },
        { key: "dato", label: "Dato", type: "date", prefill: "today", required: true },
      ],
    },
  ],
};
