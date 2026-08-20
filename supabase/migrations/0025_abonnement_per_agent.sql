-- Abonnement per agent, ikke per plattform.
--
-- Den gamle modellen var én kolonne — companies.plan — med to pakker som
-- gjaldt alt. Den bærer ikke: agentene selges hver for seg, og en kunde kan
-- ha stor pakke på tilbud og liten på dokumentasjon. Derfor én rad per
-- selskap og agent.
--
-- To ting skiller dette fra å bare lagre et pakkenavn:
--
-- 1. Pris, kvote og overforbrukssats er KOPIERT inn på raden, ikke slått opp
--    i katalogen ved visning. Justerer vi prisen på «Medium» til neste år,
--    skal ikke de som allerede står der plutselig få en annen faktura. Raden
--    er hva selskapet faktisk har avtalt.
--
-- 2. Forbruket er en hendelseslogg, ikke en teller. En teller kan bare gå opp
--    og ned, og når noen spør «hvorfor 76 og ikke 74» finnes det ikke noe
--    svar. Med én rad per talt tilbud kan hver eneste enhet på fakturaen
--    spores tilbake til leadet den kom fra.

create table subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,

  -- Ikke fremmednøkler: agent- og pakkekatalogen ligger i koden
  -- (lib/billing/agents.ts), versjonert sammen med UI-et som viser den.
  agent_id             text not null,
  plan_id              text not null,

  -- Avtalen, frosset ved valget. Se punkt 1 over.
  price_nok            integer not null,
  included_quota       integer not null,
  overage_nok          integer not null,

  -- Ankeret for månedsperiodene. Perioden regnes ut fra denne datoen i
  -- lib/billing/subscription.ts — vi lagrer ikke start og slutt, for da må
  -- noe rulle dem videre, og det noe ville vært en jobb som kan feile.
  started_at           timestamptz not null default now(),

  -- Oppsigelse tar effekt ved periodeslutt. Pakken virker ut måneden de har
  -- betalt for.
  cancel_at_period_end boolean not null default false,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (company_id, agent_id)
);

comment on table subscriptions is
  'Hvilken pakke et selskap har på hver agent, med avtalt pris frosset på raden.';

create table usage_events (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  agent_id     text not null,

  -- Hva som ble produsert. For tilbudsagenten: leadet. Den er nøkkelen til
  -- at teljinga er idempotent — se indeksen under.
  reference_id uuid,
  quantity     integer not null default 1,
  created_at   timestamptz not null default now()
);

comment on table usage_events is
  'Én rad per talt enhet. Grunnlaget for forbruk mot kvote og for overforbruk.';

-- Ett tilbud per lead, uansett hvor mange ganger agenten kjører.
--
-- Brukeren kan regenerere det samme leadet — bytte tilbudstype, prøve på nytt
-- etter en rettelse — og det skal ikke koste dem en ny enhet. At de itererer
-- er noe vi vil ha, ikke noe vi skal ta betalt for.
--
-- Postgres regner NULL-er som forskjellige i en unik indeks, så rader uten
-- reference_id kan legges inn fritt. Det er meningen: en framtidig agent som
-- teller noe annet enn et lead skal ikke tvinges inn i denne formen.
create unique index usage_events_ein_per_referanse
  on usage_events (company_id, agent_id, reference_id);

create index usage_events_periode
  on usage_events (company_id, agent_id, created_at desc);

-- Service role skriver og leser. Ingen policy => ingen tilgang for
-- authenticated, som quote_references og model_usage. Selskapet ser sitt eget
-- forbruk gjennom abonnementssiden, som går via server-koden.
alter table subscriptions enable row level security;
alter table usage_events enable row level security;

-- Den gamle plattformpakken. «tilbud» og «komplett» finnes ikke lenger som
-- begreper, og den eneste raden som hadde en verdi var testselskapet.
alter table companies drop column plan;
