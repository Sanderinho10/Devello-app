-- Ny versjon av et sendt tilbud.
--
-- Kunden kommer ofte tilbake med justeringer: «vi skal ha én stikk mindre».
-- Til nå var et sendt tilbud låst for godt, og eneste utvei var å lage et
-- nytt lead og skrive alt på nytt. Nå kan det åpnes igjen som versjon 2.
--
-- Låsen fra 0027 gjelder fortsatt: det som er sendt, endres ikke. Det som
-- gikk ut som versjon 1 ligger i draft_versions som en «endelig»-rad, med
-- PDF-en den fikk. Utkastet går videre som versjon 2, og kunden ser på PDF-en
-- at dette erstatter tilbudet fra før.

alter table drafts
  add column revisjon integer not null default 1,
  add column forrige_sendt_at timestamptz;

comment on column drafts.revisjon is
  'Hvilken versjon av tilbudet dette er. 1 til det åpnes igjen etter sending.';
comment on column drafts.forrige_sendt_at is
  'Når forrige versjon ble sendt. Vises på PDF-en: «erstatter tilbud av …».';

-- Hver loggede versjon vet hvilken tilbudsversjon den hører til, og den
-- endelige har med PDF-en som faktisk gikk ut. Uten det ville PDF-en for
-- versjon 1 blitt liggende i lagringen uten at noe pekte på den.
alter table draft_versions
  add column revisjon integer not null default 1,
  add column pdf_path text,
  add column sendt_at timestamptz;
