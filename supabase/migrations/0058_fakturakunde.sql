-- Fakturakunden: kunden fakturaen faktisk blir send til.
--
-- Kvifor: Ein jobb kan gjerast for éin kunde og fakturerast til ein annan,
-- t.d. ein leigetakar som bestiller og ein utleigar som betaler. Som i
-- PowerOffice Go kan kunden på fakturautkastet overstyrast. Fakturaen høyrer
-- då til kunden han blir send til, og til ordren, ikkje kunden på ordren.
--
-- Korleis:
--   - invoice_drafts.customer_id er fakturakunden. Han blir sett til
--     kunden på ordren når forslaget blir laga, og kan byttast med oppslag
--     i kontaktregisteret.
--   - null: ordren har ingen kunde i registeret. Då går overføringa på
--     kundefelta på ordren, som før.
--   - Kan køyrast fleire gonger. Ingen semikolon i tekstane.

alter table invoice_drafts
  add column if not exists customer_id uuid references customers(id) on delete set null;

comment on column invoice_drafts.customer_id is
  'Fakturakunden, den fakturaen blir send til. Kunden på ordren er berre forslaget.';

update invoice_drafts d
   set customer_id = o.customer_id
  from orders o
 where o.id = d.order_id
   and d.customer_id is null
   and o.customer_id is not null;

create index if not exists invoice_drafts_customer_idx
  on invoice_drafts (customer_id) where customer_id is not null;
