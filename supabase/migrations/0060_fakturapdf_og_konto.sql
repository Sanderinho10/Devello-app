-- Selve fakturaen (PDF) og konteringa frå PowerOffice Go.
--
-- Kvifor: Til no har me henta fakturahovudet og EHF-XML-en, men ikkje
-- PDF-en, så ingen kunne opne fakturaen i Devello. Og me har henta alle
-- inngåande fakturaer, ikkje berre varekjøpa — straum, husleige og
-- rekneskapsføraren har ingenting på ein ordre å gjere. Konteringa ligg
-- ikkje i fakturahovudet; ho kjem frå kontotransaksjonane per bilag, og
-- filteret (standard 4000–4999) ligg i accounting_connections.settings
-- som account_filter { enabled, from, to }. Ingen ny kolonne for det.

alter table supplier_invoices
  add column has_pdf          boolean not null default false,
  add column pdf_storage_path text,
  -- Når me sist spurde Go om dokumentasjonen (EHF/PDF) på bilaget.
  add column doc_checked_at   timestamptz,
  -- Hovudbokskontoane bilaget er ført på, frå kontotransaksjonane. Tom
  -- når filteret er av eller fakturaen kom frå grossistens fakturafil.
  add column account_numbers  integer[] not null default '{}';

comment on column supplier_invoices.pdf_storage_path is
  'Bucket supplier-invoices: PDF-en slik ho ligg i regnskapssystemet. Null når Go ikkje har nokon.';
comment on column supplier_invoices.account_numbers is
  'Hovudbokskontoar bilaget er ført på (frå AccountTransactions). Brukt av kontofilteret og vist i lista.';
