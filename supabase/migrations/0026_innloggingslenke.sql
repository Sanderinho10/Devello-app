-- Innloggingslenke vi sender selv.
--
-- Supabase sin magic link har feilet tre ganger på rad. Loggen viser hvorfor
-- det var vanskelig å se: POST /otp svarer 200, recovery_sent_at blir stemplet,
-- og ingenting i vår ende vet at e-posten aldri kom fram. UI-et sa «Sjekk
-- e-posten» fordi API-et sa ok — og det gjør det uansett.
--
-- To ting kan gå galt etter at Supabase har svart 200, og begge rammer oss:
--
-- 1. Leveringen. Den innebygde tjenesten sender fra et delt domene uten vår
--    SPF/DKIM. Microsoft slipper den gjennom noen ganger og forkaster den
--    stille andre ganger.
--
-- 2. Skanneren. Safe Links i Microsoft 365 henter lenker automatisk. Supabase
--    sin lenke er en engangslenke, så den er brukt opp før mottakeren rekker
--    å klikke. Dette bet oss på invitasjonene også — se 0018.
--
-- Derfor samme mønster som invitasjonene: vårt eget token, vår egen side, og
-- GET som ikke gjør noe. Først når et menneske trykker på knappen, veksles
-- tokenet inn i en Supabase-sesjon. En skanner sender ikke skjemaer.

create table login_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,

  -- 32 tilfeldige byte. Lenken er hele beviset, så den skal ikke kunne gjettes.
  token      text not null default encode(gen_random_bytes(32), 'hex'),

  -- Kort levetid. En innloggingslenke som ligger i innboksen i en uke er en
  -- nøkkel som ligger under matta.
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table login_tokens is
  'Engangslenker for innlogging uten passord. GET viser siden, POST bruker tokenet.';

create unique index login_tokens_token on login_tokens (token);
create index login_tokens_bruker on login_tokens (user_id, created_at desc);

-- Service role skriver og leser. Ingen policy => ingen tilgang for
-- authenticated eller anon. Tokenet må aldri kunne leses ut av en klient:
-- det ER innloggingen.
alter table login_tokens enable row level security;
