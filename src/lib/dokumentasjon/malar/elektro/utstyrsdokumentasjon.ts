import type { Mal } from "../typar";

/**
 * Utstyrsdokumentasjon — FEL § 36.
 *
 * Eieren skal ha dokumentasjon på utstyret som er montert, og veiledning om
 * bruk og vedlikehold. Datablad og FDV lastes opp som egne filer på ordren;
 * lista her sier hva som er montert og hvor.
 */
export const utstyrsdokumentasjon: Mal = {
  key: "elektro.utstyrsdokumentasjon",
  version: 1,
  fag: "elektro",
  title: "Utstyrsdokumentasjon",
  lovgrunnlag: "FEL § 36",
  beskrivelse: "Utstyret som er montert, og veiledningen eieren skal ha. Datablad lastes opp som egne filer.",
  boligmappa: { chapterTagName: "Samsvarserklæringer og garantibevis", documentTypeName: "Utstyrsdokumentasjon" },
  signature: { required: true, label: "Utarbeidet av" },
  sections: [
    {
      key: "anlegg",
      title: "Anlegg",
      fields: [
        { key: "anleggsadresse", label: "Anleggsadresse", type: "text", prefill: "order.site_address", required: true },
        { key: "eier", label: "Eier / kunde", type: "text", prefill: "order.customer_name", required: true },
        { key: "ordrenr", label: "Ordrenummer", type: "text", prefill: "order.order_no" },
        { key: "dato", label: "Dato", type: "date", prefill: "today", required: true },
        { key: "utfort_av", label: "Utarbeidet av", type: "text", prefill: "user.name", required: true },
      ],
    },
    {
      key: "utstyr",
      title: "Montert utstyr",
      repeat: { minRows: 1, addLabel: "Legg til utstyr" },
      fields: [
        { key: "type", label: "Type utstyr", type: "text", required: true, help: "F.eks. «Elbillader», «Varmekabel», «Jordfeilautomat»." },
        { key: "fabrikat", label: "Fabrikat / modell", type: "text", required: true },
        { key: "plassering", label: "Plassering", type: "text", required: true },
        { key: "dokumentasjon_vedlagt", label: "Datablad / FDV lastet opp på ordren", type: "checkbox" },
        { key: "merknad", label: "Merknad", type: "text" },
      ],
    },
    {
      key: "veiledning",
      title: "Veiledning til eier",
      fields: [
        {
          key: "bruk",
          label: "Bruk og vedlikehold",
          type: "textarea",
          required: true,
          standard:
            "Anlegget er utført for normal bruk i bolig. Test jordfeilvern med testknappen minst hver sjette måned. " +
            "Endringer og utvidelser av det elektriske anlegget skal utføres av registrert elvirksomhet. " +
            "Ved feil, varmgang eller lukt av brent: slå av kursen og kontakt installatøren. " +
            "Oppbevar denne dokumentasjonen sammen med anlegget, gjerne i Boligmappa.",
        },
        { key: "saerskilt", label: "Særskilte forhold for dette anlegget", type: "textarea", help: "Varmekabel som ikke må dekkes til, lader som krever strømbegrensning, m.m." },
      ],
    },
  ],
};
