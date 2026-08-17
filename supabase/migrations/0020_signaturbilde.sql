-- Bilde i e-postsignaturen.
--
-- Mange har logoen liggende i Outlook-signaturen sin, og en e-post fra
-- agenten som mangler den ser ut som den kom fra en annen bedrift. Signaturen
-- vår var ren tekst, så bildet var det ingen vei inn for.
--
-- Selve fila ligger i samme bøtte som logoen. Den legges ved e-postkladden
-- som et inline-vedlegg og refereres med cid: — det er slik Outlook selv gjør
-- det, og det er den eneste måten bildet også er der for mottakeren.

alter table company_brand add column signature_image_path text;

comment on column company_brand.signature_image_path is
  'Sti i brand-logos-bøtta. Legges ved e-postkladden som inline-vedlegg.';
