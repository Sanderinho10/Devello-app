import type { Mal } from "../typar";

/**
 * Rapport fra risikovurdering — FEL § 16.
 *
 * Før arbeidet starter skal installatøren vurdere ytre påvirkninger og
 * velge utstyr og vern deretter. Rapporten dokumenterer vurderingen.
 * Innholdet følger FEL § 16 og NEK 400 del 5-51; utformingen er vår egen.
 */
export const risikovurdering: Mal = {
  key: "elektro.risikovurdering",
  version: 1,
  fag: "elektro",
  title: "Rapport fra risikovurdering",
  lovgrunnlag: "FEL § 16",
  beskrivelse:
    "Vurderingen av ytre påvirkninger og valg av utstyr og vern, gjort før arbeidet. Eieren skal ha originalen.",
  boligmappa: { chapterTagName: "Samsvarserklæringer og garantibevis", documentTypeName: "Risikovurdering" },
  signature: { required: true, label: "Utført av" },
  sections: [
    {
      key: "anlegg",
      title: "Anlegg",
      fields: [
        { key: "anleggsadresse", label: "Anleggsadresse", type: "text", prefill: "order.site_address", required: true },
        { key: "eier", label: "Eier / kunde", type: "text", prefill: "order.customer_name", required: true },
        { key: "ordrenr", label: "Ordrenummer", type: "text", prefill: "order.order_no" },
        {
          key: "omfang",
          label: "Hva arbeidet omfatter",
          type: "textarea",
          prefill: "order.description",
          required: true,
          help: "Kort: hvilke deler av anlegget som berøres.",
        },
        {
          key: "anleggstype",
          label: "Type anlegg",
          type: "select",
          required: true,
          options: [
            { value: "bolig", label: "Bolig" },
            { value: "fritidsbolig", label: "Fritidsbolig" },
            { value: "naering", label: "Næringsbygg" },
            { value: "landbruk", label: "Landbruk" },
            { value: "annet", label: "Annet" },
          ],
        },
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
      key: "ytre",
      title: "Ytre påvirkninger",
      help: "Vurder hvert punkt. Avvik = forholdet krever tiltak; beskriv tiltaket under.",
      fields: [
        { key: "fukt", label: "Fukt og vann (bad, utendørs, kjeller)", type: "check3", required: true },
        { key: "temperatur", label: "Temperatur (høy/lav, sol, varmekilder)", type: "check3", required: true },
        { key: "mekanisk", label: "Mekanisk påkjenning (slag, vibrasjon, gnaging)", type: "check3", required: true },
        { key: "brann", label: "Brannfare (brennbart materiale, støv, lagring)", type: "check3", required: true },
        { key: "korrosjon", label: "Korrosjon og kjemisk påvirkning", type: "check3", required: true },
        { key: "stoev", label: "Støv og fremmedlegemer", type: "check3", required: true },
        { key: "personer", label: "Personer (barn, eldre, allmennheten, uvitende brukere)", type: "check3", required: true },
        { key: "byggmateriale", label: "Byggets materialer (tre, isolasjon, brennbarhet)", type: "check3", required: true },
        { key: "ytre_kommentar", label: "Kommentar til ytre påvirkninger", type: "textarea" },
      ],
    },
    {
      key: "valg",
      title: "Valg av utstyr og vern",
      fields: [
        { key: "ip_grad", label: "Kapslingsgrad (IP) valgt for utsatte områder", type: "text", required: true, help: "F.eks. IP44 på bad sone 2, IP65 utendørs." },
        {
          key: "overspenningsvern",
          label: "Overspenningsvern",
          type: "select",
          required: true,
          options: [
            { value: "montert", label: "Montert / finnes" },
            { value: "ikke_nodvendig", label: "Ikke nødvendig — begrunnet under" },
            { value: "anbefalt_avslatt", label: "Anbefalt, avslått av eier" },
          ],
        },
        { key: "overspenningsvern_begrunnelse", label: "Begrunnelse for overspenningsvern", type: "textarea" },
        {
          key: "jordfeilvern_type",
          label: "Jordfeilvern",
          type: "select",
          required: true,
          options: [
            { value: "A", label: "Type A" },
            { value: "B", label: "Type B" },
            { value: "F", label: "Type F" },
            { value: "AC", label: "Type AC" },
            { value: "annet", label: "Annet / kombinasjon" },
          ],
          help: "Type B der det er utstyr med likestrømskomponent, f.eks. elbillader og frekvensomformere.",
        },
        { key: "vern_kommentar", label: "Kommentar til valg av vern og utstyr", type: "textarea" },
      ],
    },
    {
      key: "tiltak",
      title: "Særskilte tiltak og konklusjon",
      fields: [
        { key: "tiltak", label: "Særskilte tiltak som følge av vurderingen", type: "textarea", help: "Branntetting, ekstra beskyttelse, informasjon til eier, m.m." },
        {
          key: "konklusjon",
          label: "Konklusjon",
          type: "select",
          required: true,
          options: [
            { value: "ok", label: "Anlegget kan utføres som planlagt" },
            { value: "med_tiltak", label: "Kan utføres med tiltakene over" },
            { value: "avvik", label: "Krever avklaring med eier før arbeidet starter" },
          ],
        },
        { key: "dato", label: "Dato for vurderingen", type: "date", prefill: "today", required: true },
        { key: "utfort_av", label: "Utført av", type: "text", prefill: "user.name", required: true },
      ],
    },
  ],
};
