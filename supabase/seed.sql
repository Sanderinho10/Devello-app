-- Utviklingsdata. Køyr etter migrasjonane, og berre i eit dev-prosjekt.
--
-- Prisane under er plasshaldarar for å få flyten i gang — dei må erstattast med
-- Star Elektro sine faktiske satsar før pilot.

insert into companies (id, name, org_nr, tone_settings)
values (
  '00000000-0000-0000-0000-000000000001',
  'Star Elektro AS',
  '912345678',
  '{"formalitet": "du", "signatur": "Med venleg helsing\nStar Elektro AS"}'::jsonb
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
  'Org.nr 912 345 678 MVA · Alle prisar er oppgitt eks. mva.'
)
on conflict (company_id) do nothing;

-- Punktpris: bunta pris, arbeid og materiell samla.
insert into price_list_items (company_id, kind, name, description, unit, unit_price, includes_labour, includes_material)
values
  ('00000000-0000-0000-0000-000000000001', 'punktpris', 'Montering stikkontakt, dobbel', 'Standard dobbel stikkontakt i eksisterande vegg', 'stk', 890, true, true),
  ('00000000-0000-0000-0000-000000000001', 'punktpris', 'Kursopplegg frå sikringsskap', 'Ny kurs, inkl. kabel og automat', 'stk', 2450, true, true),
  ('00000000-0000-0000-0000-000000000001', 'punktpris', 'Montering takpunkt med brytar', null, 'stk', 1340, true, true),
  ('00000000-0000-0000-0000-000000000001', 'punktpris', 'Montering varmekabel', 'Per kvadratmeter, inkl. kabel og termostat-tilkopling', 'm²', 1150, true, true);

-- Materiell: brukt i fastpris-spesifikasjon.
insert into price_list_items (company_id, kind, name, unit, unit_price, includes_labour, includes_material)
values
  ('00000000-0000-0000-0000-000000000001', 'materiell', 'Sikringsskap 24 modular', 'stk', 4200, false, true),
  ('00000000-0000-0000-0000-000000000001', 'materiell', 'Jordfeilautomat 16 A', 'stk', 640, false, true),
  ('00000000-0000-0000-0000-000000000001', 'materiell', 'Kabel PFSP 3G2,5', 'm', 38, false, true);

-- Timepris: brukt i fastpris og i tid og materiell.
insert into price_list_items (company_id, kind, name, description, unit, unit_price, includes_labour, includes_material)
values
  ('00000000-0000-0000-0000-000000000001', 'time', 'Timepris elektrikar', 'Ordinær arbeidstid', 'time', 1190, true, false),
  ('00000000-0000-0000-0000-000000000001', 'time', 'Køyring', 'Per oppdrag innanfor Førde kommune', 'stk', 450, true, false);

-- Referansetilbod: fasiten agenten matchar tilbudstype mot.
insert into reference_quotes (company_id, title, type, job_description)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Tilbod — stikkontaktar og takpunkt, rekkjehus Bjørkevegen',
    'punktpris',
    'Montering av stikkontaktar og takpunkt i nybygg. Standardiserte einingar, kjent tal, kjent omfang.'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Tilbod — oppgradering sikringsskap Nordvikbygg',
    'fastpris',
    'Utskifting av sikringsskap i eldre einebustad. Avgrensa jobb som lèt seg spesifisere med materiell og timar, men ikkje standardiserte einingar.'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Tilbod — feilsøking flimrande lys Hafstadvegen',
    'tid_og_materiell',
    'Kunden melder om eit symptom utan kjend årsak. Omfanget kan ikkje fastsetjast før feilsøkinga er i gang.'
  );

-- Knyt ein innlogga brukar til selskapet. Byt ut e-posten før du køyrer.
-- Brukaren må ha logga inn éin gong slik at rada finst i auth.users.
--
-- insert into users (id, company_id, email)
-- select id, '00000000-0000-0000-0000-000000000001', email
-- from auth.users where email = 'deg@firma.no'
-- on conflict (id) do update set company_id = excluded.company_id;
