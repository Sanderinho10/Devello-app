-- Tilgang følger abonnementet, og ubetalte fakturaer deaktiverer kontoen.
--
-- 1. companies.abonnement_unntak: selskap som alltid har løpende abonnement
--    og aldri faktureres. Brukes for demo- og testselskapet (Star Elektro
--    DEMO). Unntaket får alle modulene og sperres aldri.
--
-- 2. devello_fakturaer: fakturaene Devello sender selskapet for
--    abonnementet. Betaling er ikke koblet på ennå, så radene legges inn og
--    markeres betalt av Devello. En faktura som ikke er betalt ved forfall,
--    gir et varsel i appen som ikke kan lukkes. 30 dager etter forfall
--    deaktiveres kontoen til den er betalt (lib/billing/tilgang.ts).
--
--    Ingen policy: tabellen leses bare med service role, for selskapet ut
--    fra sesjonen.

alter table companies add column abonnement_unntak boolean not null default false;

update companies
   set abonnement_unntak = true,
       moduler = '{tilbud,ordre}'
 where id = '00000000-0000-0000-0000-000000000001'; -- Star Elektro AS DEMO

create table devello_fakturaer (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  fakturanr   text not null,
  belop_nok   numeric(12, 2) not null,
  forfall     date not null,
  betalt_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (company_id, fakturanr)
);

create index devello_fakturaer_ubetalte on devello_fakturaer (company_id, forfall) where betalt_at is null;

alter table devello_fakturaer enable row level security;
