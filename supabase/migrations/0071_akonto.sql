-- Akontofaktura: fleire fakturaer på same ordre.
--
-- Kvifor: Til no har ein ordre hatt éin faktura, og ordren blei lukka som
-- fakturert når ho blei overført. På større jobbar vil kunden fakturere
-- undervegs: eit beløp eller ein prosent av avtalt pris ved oppstart eller
-- etter framdrift, og så ein sluttfaktura der det som er fakturert a konto
-- blir trekt frå.
--
-- Korleis:
--   - invoice_drafts.is_akonto skil akontofakturaene frå sluttfakturaen.
--     akonto_no er løpenummeret på ordren (a konto nr. 1, 2, ...).
--   - Ein ordre kan ha mange akontofakturaer, men berre eitt ope akontoutkast
--     om gongen, og framleis berre eitt levande sluttfakturaforslag.
--   - Akontolinja har linjetype «akonto». Sluttfakturaen får ei linje
--     «akonto_fratrekk» per overført akonto, med akontoutkastet som kjelde
--     (sources type invoice_draft). Beløpa blir rekna av koden.
--   - Begge går på produktet «akonto» i product_map, så akonto og frådrag
--     nullar seg ut på same konto i rekneskapen.
--   - Kan køyrast fleire gonger. Ingen semikolon i tekstane.

alter table invoice_drafts
  add column if not exists is_akonto boolean not null default false,
  add column if not exists akonto_no integer;

comment on column invoice_drafts.is_akonto is
  'Akontofaktura: eit beløp fakturert undervegs. Lukkar ikkje ordren, og blir trekt frå på sluttfakturaen.';
comment on column invoice_drafts.akonto_no is
  'Løpenummeret til akontofakturaen på ordren. Null for alt som ikkje er akonto.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_drafts_akonto_paa_ordre') then
    alter table invoice_drafts
      add constraint invoice_drafts_akonto_paa_ordre
      check (not is_akonto or (order_id is not null and akonto_no is not null));
  end if;
end $$;

-- Éitt levande sluttfakturaforslag per ordre, som før. Akonto tel ikkje med.
drop index if exists invoice_drafts_ein_aktiv_per_ordre;
create unique index if not exists invoice_drafts_ein_aktiv_per_ordre
  on invoice_drafts (order_id) where status <> 'feil' and not is_akonto;

-- Éitt ope akontoutkast per ordre: det førre må overførast eller slettast fyrst.
create unique index if not exists invoice_drafts_eitt_ope_akonto
  on invoice_drafts (order_id) where is_akonto and status <> 'overfort';

create unique index if not exists invoice_drafts_akonto_nr
  on invoice_drafts (order_id, akonto_no) where is_akonto;

comment on column accounting_connections.product_map is
  '{ "arbeid": "DEV-ARB", "materiell": "DEV-MAT", "fastpris": "DEV-FAST", "annet": "DEV-ANN", "akonto": "DEV-AKONTO" } — produktkoder i regnskapssystemet.';
