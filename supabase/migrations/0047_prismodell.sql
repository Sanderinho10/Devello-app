-- Ny prismodell: éi pakke per selskap, grunnpris + pris per eining.
--
-- Kvifor: Kvotemodellen (Basis 30 tilbod, Pro 100) skalerer ikkje til to
-- modular og ein montørapp. Ny modell etter PowerOffice Go sitt mønster:
-- låg grunnpris, pris per tilbod/faktura/aktiv montør, og ein årspakke
-- (Mikro) for dei minste. Avtalen er framleis frosen på rada.

-- 1. Abonnementet: éi rad per selskap.
alter table subscriptions
  add column package_id         text,
  add column billing_interval   text not null default 'maanad',   -- 'maanad' | 'aar'
  add column included_units     integer not null default 0,
  add column unit_prices        jsonb not null default '{}'::jsonb,  -- { "tilbud": 29, "faktura": 9 }
  add column included_app_users integer not null default 0,
  add column app_user_price_nok integer not null default 0;

-- Gamle rader: same avtale i ny form. Basis/Pro hadde grunnpris + inkluderte
-- tilbod + overpris — det er nøyaktig ei pakke med includedUnits.
update subscriptions set
  package_id     = 'tilbud',
  included_units = included_quota,
  unit_prices    = jsonb_build_object('tilbud', overage_nok, 'faktura', 0)
where package_id is null;
alter table subscriptions alter column package_id set not null;

-- Éi pakke per selskap. Den gamle nøkkelen var (company, agent).
alter table subscriptions drop constraint subscriptions_company_id_agent_id_key;
create unique index subscriptions_ein_per_selskap on subscriptions (company_id);
-- agent_id, plan_id, included_quota, overage_nok blir ståande (lesbare i
-- historikk), men ingenting nytt skriv til dei. Fjern i ein seinare migrasjon.
alter table subscriptions
  alter column agent_id drop not null,
  alter column plan_id drop not null,
  alter column included_quota drop not null,
  alter column overage_nok drop not null;

-- 2. Forbruk: tre slag.
alter table usage_events
  add column kind         text not null default 'tilbud',   -- 'tilbud' | 'faktura' | 'app_bruker'
  add column user_id      uuid references users(id) on delete set null,
  add column period_start date;                               -- berre app_bruker
alter table usage_events alter column kind drop default;
alter table usage_events alter column agent_id drop not null;
-- tilbud/faktura: éin per referanse (lead / ordre).
drop index usage_events_ein_per_referanse;
create unique index usage_events_ein_per_referanse
  on usage_events (company_id, kind, reference_id) where reference_id is not null;
-- app_bruker: éin per brukar per månad.
create unique index usage_events_ein_app_brukar_per_maanad
  on usage_events (company_id, user_id, period_start) where kind = 'app_bruker';
create index usage_events_periode_kind on usage_events (company_id, kind, created_at desc);

-- 3. Modulane kjem frå pakken. Overstyring for pilotkundar Devello styrer for hand.
alter table companies add column moduler_overstyrt boolean not null default false;
-- Pilotane: selskap som har fått modular for hand — ordre-modulen finst
-- berre slik i dag (Star Elektro), og selskap med modular utan abonnement.
-- Elles ville konverteringa til pakken «Tilbud» teke frå dei ordre.
update companies set moduler_overstyrt = true
 where 'ordre' = any(moduler)
    or (moduler <> '{}' and id not in (select company_id from subscriptions));
