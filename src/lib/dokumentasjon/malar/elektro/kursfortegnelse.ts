import type { Mal } from "../typar";

/**
 * Kursfortegnelse — FEL § 12, NEK 400.
 *
 * Tabellen over kursene i fordelingen: vern, jordfeilvern, tverrsnitt og
 * hva kursen forsyner. Skal henge i skapet og følge anlegget.
 */
export const kursfortegnelse: Mal = {
  key: "elektro.kursfortegnelse",
  version: 1,
  fag: "elektro",
  title: "Kursfortegnelse",
  lovgrunnlag: "FEL § 12, NEK 400",
  beskrivelse: "Kursene i fordelingen slik de er etter arbeidet. Én rad per kurs.",
  boligmappa: { chapterTagName: "Samsvarserklæringer og garantibevis", documentTypeName: "Kursfortegnelse" },
  signature: { required: true, label: "Utarbeidet av" },
  sections: [
    {
      key: "anlegg",
      title: "Anleggsdata",
      fields: [
        { key: "anleggsadresse", label: "Anleggsadresse", type: "text", prefill: "order.site_address", required: true },
        { key: "eier", label: "Eier / kunde", type: "text", prefill: "order.customer_name", required: true },
        { key: "fordeling", label: "Fordeling (plassering)", type: "text", required: true, help: "F.eks. «Sikringsskap, gang 1. etasje»." },
        { key: "hovedvern", label: "Hovedvern (type, In)", type: "text", required: true },
        {
          key: "systemjording",
          label: "Systemjording",
          type: "select",
          required: true,
          options: [
            { value: "TN-C-S", label: "TN-C-S" },
            { value: "TN-S", label: "TN-S" },
            { value: "IT", label: "IT" },
            { value: "TT", label: "TT" },
          ],
        },
        { key: "jordelektrode", label: "Jordelektrode (type, plassering)", type: "text" },
        { key: "overspenningsvern", label: "Overspenningsvern (type, plassering)", type: "text" },
        { key: "dato", label: "Dato", type: "date", prefill: "today", required: true },
        { key: "utfort_av", label: "Utarbeidet av", type: "text", prefill: "user.name", required: true },
      ],
    },
    {
      key: "kursar",
      title: "Kurser",
      repeat: { minRows: 1, addLabel: "Legg til kurs" },
      fields: [
        { key: "kurs_nr", label: "Kurs nr", type: "text", required: true },
        { key: "vern", label: "Vern (type, In)", type: "text", required: true, help: "F.eks. «B16», «C20»." },
        { key: "jordfeilvern", label: "Jordfeilvern (type, IΔn)", type: "text", help: "F.eks. «A 30 mA». Tom om kursen ikke har eget." },
        { key: "tverrsnitt", label: "Ledertverrsnitt", type: "text", required: true, help: "F.eks. «3G2,5». " },
        { key: "forsyner", label: "Forsyner", type: "text", required: true },
        { key: "rom", label: "Rom", type: "text" },
        { key: "merknad", label: "Merknad", type: "text" },
      ],
    },
  ],
};
