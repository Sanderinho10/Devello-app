-- Fakturaer uten ordre.
--
-- Kvifor: Til no har ein faktura alltid høyrt til ein ordre — forslaget blir
-- bygd av tilbodet, timane og materiellet på jobben. Men ikkje alt som skal
-- fakturerast er ein jobb: eit konsulentoppdrag, eit gebyr, ei vidarefakturering.
-- Som med ordre (som kan lagast frå tilbod eller rett i ordrefana), kan ein
-- faktura no lagast frå ordren eller rett i fakturafana.
--
-- Korleis:
--   - invoice_drafts.order_id kan vere null. Då er fakturaen frittståande.
--   - Ein frittståande faktura har sin eigen tittel og sine eigne kundefelt
--     (same form som på ordren). Ein faktura på ein ordre les kundefelta frå
--     ordren, som før, og lèt desse stå tomme.
--   - strategy er 'manuell' for frittståande: linjene er skrivne av eit
--     menneske, ingen agent har valt struktur.
--   - Kan køyrast fleire gonger. Ingen semikolon i tekstane.

alter table invoice_drafts alter column order_id drop not null;

alter table invoice_drafts
  add column if not exists title            text,
  add column if not exists customer_name    text,
  add column if not exists customer_contact text,
  add column if not exists customer_email   text,
  add column if not exists customer_phone   text,
  add column if not exists customer_address text;

comment on column invoice_drafts.order_id is
  'Ordren fakturaen er laga frå. Null: frittståande faktura, laga rett i fakturafana.';
comment on column invoice_drafts.customer_name is
  'Berre for frittståande fakturaer. Fakturaer på ein ordre les kundefelta frå ordren.';

-- Ein faktura utan ordre må ha ein kunde å bli send til.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_drafts_ordre_eller_kunde') then
    alter table invoice_drafts
      add constraint invoice_drafts_ordre_eller_kunde
      check (order_id is not null or coalesce(customer_name, '') <> '');
  end if;
end $$;

-- Fakturalista: alle fakturaer i selskapet, nyaste fyrst.
create index if not exists invoice_drafts_company_idx on invoice_drafts (company_id, created_at desc);
