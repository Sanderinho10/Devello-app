-- Saksbehandlar og hovudansvarleg på ordren.
--
-- Kvifor: Som i PowerOffice Go skal det stå kven som følgjer opp ordren
-- (saksbehandlar) og kven som har ansvaret for jobben (hovudansvarleg).
--
-- Korleis:
--   - To valfrie peikarar til users. Tomt felt betyr forslaget, brukaren som
--     oppretta ordren (created_by). Det står grått i skjemaet og gjeld til
--     nokon vel ein annan.
--   - Ein brukar som blir sletta, slepp taket (on delete set null), og
--     forslaget gjeld att.
--   - Kan køyrast fleire gonger. Ingen semikolon i tekstane.

alter table orders
  add column if not exists saksbehandler_id  uuid references users(id) on delete set null,
  add column if not exists hovedansvarlig_id uuid references users(id) on delete set null;

comment on column orders.saksbehandler_id is
  'Saksbehandlar. null betyr forslaget, brukaren som oppretta ordren.';
comment on column orders.hovedansvarlig_id is
  'Hovudansvarleg. null betyr forslaget, brukaren som oppretta ordren.';
