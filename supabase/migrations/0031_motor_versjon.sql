-- Motor v3 bak en bryter.
--
-- Agenten finnes nå i to versjoner side om side (agent/v2 og agent/v3, se
-- lib/claude/motor.ts). Hvilken et selskap kjører er en innstilling, ikke en
-- utrulling: null betyr standarden (MOTOR_DEFAULT i miljøet, ellers v2). Blir
-- v3 dårligere enn v2 på evalueringen eller i piloten, settes kolonnen tilbake
-- — ingen kode, ingen migrasjon, og v2-koden er ikke rørt.
--
-- Alt her er additivt. v2 leser og skriver drafts som før; de nye kolonnene
-- er null for alt v2 lager.

alter table companies
  add column motor_versjon text
    check (motor_versjon is null or motor_versjon in ('v2', 'v3')),
  add column fag text;

comment on column companies.motor_versjon is
  'Tilbudsagentens motor for dette selskapet: v2, v3, eller null = standard (MOTOR_DEFAULT, ellers v2).';
comment on column companies.fag is
  'Faget selskapet driver — velger bransjepakken (sjekklister, prisbånd) i v3. null = elektro.';

alter table drafts
  add column motor_versjon text
    check (motor_versjon is null or motor_versjon in ('v2', 'v3')),
  add column omfang jsonb;

comment on column drafts.motor_versjon is
  'Motoren som laget utkastet. null for utkast fra før v3. Gjør at gullsettet kan måle v2 og v3 hver for seg.';
comment on column drafts.omfang is
  'Bare v3: omfanget fra steg 1 — jobbtype, kundetype, arbeidsposter, antakelser og spørsmål til kunden.';
