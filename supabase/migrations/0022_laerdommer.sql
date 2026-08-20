-- Agenten lærer av rettelsene den får.
--
-- Referanselisten fra 0011 lagrer allerede brukerens ENDELIGE versjon med
-- nøkkelord, og hvert utkast blir hentet fram igjen når et lignende lead
-- kommer inn. Det agenten IKKE har sett, er hva den bommet på: diffen mellom
-- sin egen tekst og den brukeren faktisk sendte ligger i draft_versions og har
-- aldri vært vist til modellen.
--
-- To ting her:
--
-- 1. edit_summary på referansen — hva brukeren endret, i klartekst. Går inn i
--    prompten sammen med referansen, så agenten ser både fasiten og hva som
--    skilte den fra førsteutkastet.
--
-- 2. agent_lessons — varige regler utledet av rettelsene. «Skriv alltid at
--    stillas kommer i tillegg ved arbeid over 3 meter.» Disse går inn i hver
--    generering.
--
-- Lærdommer må godkjennes av et menneske før de gjelder. En feillært regel
-- ville påvirket hvert eneste tilbud etterpå, og modellen generaliserer gjerne
-- fra én engangsrettelse — «kunden fikk 10 % rabatt» skal ikke bli «gi alltid
-- 10 % rabatt». Godkjenningen er billig; en regel som stille forgifter alle
-- framtidige tilbud er det ikke.

alter table quote_references add column edit_summary text;

comment on column quote_references.edit_summary is
  'Hva brukeren endret fra agentens utkast til det som ble sendt.';

create type lesson_status as enum ('foreslaatt', 'aktiv', 'avvist');

create table agent_lessons (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,

  -- Selve regelen, i imperativ og på én linje. Dette går ordrett inn i
  -- prompten, så den skal kunne leses av et menneske og av en modell.
  regel        text not null,
  -- Hvilken rettelse den kom fra. Vises i godkjenningen, aldri til modellen.
  begrunnelse  text,
  -- null = gjelder alle tilbudstyper.
  quote_type   quote_type,

  status       lesson_status not null default 'foreslaatt',
  -- Utkastet som utløste forslaget, for den som vil se hva som faktisk skjedde.
  draft_id     uuid references drafts(id) on delete set null,
  -- Hvor mange ganger samme rettelse er sett. Et mønster som gjentar seg er
  -- mer verdt enn en engangshendelse.
  ganger       integer not null default 1,

  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references users(id) on delete set null
);

create index agent_lessons_company_idx
  on agent_lessons (company_id, status, created_at desc);

alter table agent_lessons enable row level security;

-- Kolleger i samme selskap ser lærdommene og godkjenner dem. Skriving går
-- gjennom API-et, som sjekker rollen.
create policy agent_lessons_select on agent_lessons
  for select to authenticated
  using (company_id = auth_company_id());
