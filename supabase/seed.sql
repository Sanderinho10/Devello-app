-- Utviklingsdata. Kjør etter migrasjonene, og bare i et dev-prosjekt.
--
-- Prisene under er plassholdere for å få flyten i gang — de må erstattes med
-- Star Elektros faktiske satser før pilot.

insert into companies (id, name, org_nr, tone_settings)
values (
  '00000000-0000-0000-0000-000000000001',
  'Star Elektro AS',
  '812345672',
  '{"formalitet": "du", "signatur": "Med vennlig hilsen\nStar Elektro AS"}'::jsonb
)
on conflict (id) do nothing;

insert into company_brand (
  company_id, primary_color, contact_email, contact_phone,
  address_line, postal_code, city, website, footer_note
)
values (
  '00000000-0000-0000-0000-000000000001',
  '#0a5c3a',
  'post@starelektro.no',
  '57 82 10 40',
  'Storgata 14',
  '6800',
  'Førde',
  'starelektro.no',
  'Org.nr 912 345 678 MVA · Alle priser er oppgitt eks. mva.'
)
on conflict (company_id) do nothing;

-- En prisliste per type. En kunde kan ha flere av hver; her holder én.
insert into price_lists (id, company_id, kind, name)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'punktpris', 'Punktprisliste'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'materiell', 'Materielliste'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000001', 'time',      'Timeprisliste')
on conflict (id) do nothing;

-- Punktpris: buntet pris, arbeid og materiell samlet.
insert into price_list_items (company_id, price_list_id, kind, name, description, unit, unit_price, includes_labour, includes_material)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'punktpris', 'Montering stikkontakt, dobbel', 'Standard dobbel stikkontakt i eksisterende vegg', 'stk', 890, true, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'punktpris', 'Kursopplegg fra sikringsskap', 'Ny kurs, inkl. kabel og automat', 'stk', 2450, true, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'punktpris', 'Montering takpunkt med bryter', null, 'stk', 1340, true, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'punktpris', 'Montering varmekabel', 'Per kvadratmeter, inkl. kabel og termostat-tilkobling', 'm²', 1150, true, true);

-- Materiell: brukt i fastpris-spesifikasjon.
insert into price_list_items (company_id, price_list_id, kind, name, unit, unit_price, includes_labour, includes_material)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'materiell', 'Sikringsskap 24 moduler', 'stk', 4200, false, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'materiell', 'Jordfeilautomat 16 A', 'stk', 640, false, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'materiell', 'Kabel PFSP 3G2,5', 'm', 38, false, true);

-- Timepris: brukt i fastpris og i tid og materiell.
insert into price_list_items (company_id, price_list_id, kind, name, description, unit, unit_price, includes_labour, includes_material)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'time', 'Timepris elektriker', 'Ordinær arbeidstid', 'time', 1190, true, false),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'time', 'Kjøring', 'Per oppdrag innenfor Førde kommune', 'stk', 450, true, false);

-- Referansetilbud blir IKKE seedet.
--
-- En referanse er en fil merket med tilbudstype, og en seedet rad har ingen
-- fil. Den ville blitt liggende i Referansefiler-fana som en oppføring uten
-- noe å åpne. Last opp ekte tilbud gjennom fana i stedet — det er den eneste
-- veien som også får filen inn i storage.

-- Knytt en innlogget bruker til selskapet. Bytt ut e-posten før du kjører.
-- Brukeren må ha logget inn én gang slik at raden finnes i auth.users.
--
-- insert into users (id, company_id, email)
-- select id, '00000000-0000-0000-0000-000000000001', email
-- from auth.users where email = 'deg@firma.no'
-- on conflict (id) do update set company_id = excluded.company_id;
