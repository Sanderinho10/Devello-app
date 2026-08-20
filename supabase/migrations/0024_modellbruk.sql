-- Hva et tilbud faktisk koster oss.
--
-- Til nå har vi bare hatt anslag: tegn i prompten delt på et tokenforhold.
-- Anthropic svarer med et usage-objekt på hvert kall, og det er fasiten.
-- Uten den kan vi verken prise abonnementet riktig eller se om
-- mellomlagringen i lib/claude/client.ts faktisk treffer.
--
-- Fire tall per kall, fordi de har fire forskjellige priser:
--
--   input_tokens        full pris   (1×)
--   cache_write_tokens  skriving    (1,25× ved 5 min, 2× ved 1 time)
--   cache_read_tokens   lesing      (0,1×)
--   output_tokens       svar + tenking
--
-- NB: input_tokens fra Anthropic er BARE den delen som ikke ble mellomlagret.
-- Hele prompten er summen av de tre første. Ser du 4 000 input_tokens på en
-- generering, er resten lest fra cache — ikke forsvunnet.

create table model_usage (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,

  -- Hvilket kall dette var. Tre av dem per tilbud, med svært ulik størrelse,
  -- så en samlet sum uten denne kolonnen sier lite.
  kind               text not null,
  model              text not null,

  input_tokens       integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens  integer not null default 0,
  output_tokens      integer not null default 0,

  -- Leadet kallet hørte til, når det finnes. Gjør det mulig å svare på «hva
  -- kostet akkurat dette tilbudet» og ikke bare «hva kostet mars».
  lead_id            uuid references leads(id) on delete set null,

  created_at         timestamptz not null default now()
);

comment on table model_usage is
  'Faktisk tokenforbruk per modellkall. Kilden til kost per tilbud.';

create index model_usage_company_tid on model_usage (company_id, created_at desc);
create index model_usage_lead on model_usage (lead_id) where lead_id is not null;

-- Som quote_references og partners: agenten skriver dette med service role.
-- Ingen policy => ingen tilgang for authenticated. Skal kunden en dag se sitt
-- eget forbruk, kommer det som en egen, avgrenset visning — ikke ved å åpne
-- tabellen.
alter table model_usage enable row level security;
