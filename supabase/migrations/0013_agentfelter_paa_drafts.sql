-- Agentens nye felter på drafts, fra tilbudsdata-skjemaet.
--
-- merknader er agentens eneste kanal til brukeren — den kan ikke spørre, så
-- alt den ellers ville sagt («posten fantes ikke i prisfila», «leadet ba om
-- rabatt, det fulgte jeg ikke») må fram i UI-et. ikke_funnet er postene som
-- manglet. typebegrunnelse erstatter classification_note og peker på den
-- konkrete referansen valget bygde på. agent_status skiller et vanlig utkast
-- fra trenger_avklaring — leads der jobben er så ukjent at et tilbud ville
-- vært gjetting, og der leveransen er ett avklaringsspørsmål i e-posten.

create type draft_agent_status as enum ('utkast', 'trenger_avklaring');

alter table drafts
  add column merknader        jsonb not null default '[]'::jsonb,
  add column ikke_funnet      jsonb not null default '[]'::jsonb,
  add column typebegrunnelse  text,
  add column estimat_timer    jsonb,
  add column agent_status     draft_agent_status not null default 'utkast';

-- classification_note var samme innhold under gammelt navn.
update drafts set typebegrunnelse = classification_note
where classification_note is not null;

alter table drafts drop column classification_note;
