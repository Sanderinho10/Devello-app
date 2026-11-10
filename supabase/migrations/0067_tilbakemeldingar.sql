-- Tilbakemeldingar frå kundane.
--
-- Kvifor: «Gi tilbakemelding» i menyen sender e-post til Devello. E-posten er
-- for å svare, tabellen er for å sjå mønster: kva kjem att, frå kven, og kva
-- er teke hand om. Meldinga blir lagra før e-posten blir send, så ho ikkje
-- går tapt om utsendinga feilar.
--
-- Ingen policy: tabellen blir skriven og lesen berre med service role —
-- skriven frå api/tilbakemelding, lesen på /devello/tilbakemeldinger.
-- Kan køyrast fleire gonger.

create table if not exists devello_tilbakemeldinger (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete set null,
  user_id       uuid,
  epost         text not null,
  selskap       text not null,
  type          text not null check (type in ('feil', 'onske', 'annet')),
  melding       text not null,
  side          text,
  nettleser     text,
  epost_sendt   boolean not null default false,
  behandlet_at  timestamptz,
  created_at    timestamptz not null default now()
);

comment on column devello_tilbakemeldinger.selskap is
  'Namnet på selskapet då meldinga kom. Står att om selskapet blir sletta.';
comment on column devello_tilbakemeldinger.epost_sendt is
  'Om e-posten til Devello gjekk ut. False: sjå lista, ingen fekk varsel.';

create index if not exists devello_tilbakemeldinger_nyaste on devello_tilbakemeldinger (created_at desc);

alter table devello_tilbakemeldinger enable row level security;
