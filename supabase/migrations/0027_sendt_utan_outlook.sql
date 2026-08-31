-- Tilbud kan fullføres uten Outlook.
--
-- Manuelle leads finnes allerede for dem som ikke har koblet postkassen: de
-- skriver inn henvendelsen selv etter en telefon. Men bekreft-flyten stoppet
-- likevel med «Ingen postkasse tilkoblet», og da var utkastet like ubrukelig.
-- Halve løsningen er ingen løsning.
--
-- Nå lager bekreft PDF-en og lagrer den endelige versjonen uansett. Har de
-- Outlook, havner kladden der som før. Har de det ikke, får de PDF-en,
-- mottakeren, emnet og teksten i et vindu og sender fra sin egen e-post.
--
-- Derfor et skille mellom to ting som til nå var det samme:
--
--   bekrefta  Utkastet er ferdig og PDF-en er laget. Kladden ligger i Outlook,
--             eller venter på å bli sendt manuelt. Kan fortsatt endres.
--   sendt     Mennesket har sagt at tilbudet er ute hos kunden. Låst.
--
-- Låsingen er poenget med den siste. Et tilbud som er hos kunden og et tilbud
-- i appen som ikke lenger ligner på det, er verre enn ingen historikk.

alter type lead_status add value 'sendt' after 'bekrefta';

alter table drafts add column sent_at timestamptz;

comment on column drafts.sent_at is
  'Satt når brukeren bekrefter at tilbudet er sendt. Låser utkastet for redigering.';
