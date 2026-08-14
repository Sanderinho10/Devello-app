-- Oppfølging av Supabases security advisor.

-- 1. Lås search_path på trigger-funksjonen. Uten dette kan en rolle med egen
--    search_path få funksjonen til å treffe feil objekt.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. handle_new_user() er en trigger-funksjon og skal aldri kalles som RPC.
--    Supabase eksponerer alt i public via /rest/v1/rpc, så vi tar vekk tilgangen.
revoke execute on function handle_new_user() from anon, authenticated, public;

-- auth_company_id() forblir med vilje kallbar for authenticated: RLS-policyene
-- kaller den som den innloggede rollen, så EXECUTE må være der. Den returnerer
-- bare kallerens egen company_id — noe kalleren allerede vet.
revoke execute on function auth_company_id() from anon;

-- Advisor-varsel vi med vilje ikke gjør noe med:
--
-- «mailbox_connections har RLS men ingen policy» — det er poenget. Ingen policy
-- betyr ingen tilgang for anon/authenticated, og OAuth-tokens skal bare være
-- lesbare for service role.
--
-- «tabell synlig i GraphQL-skjemaet» — skjemaet lister tabellnavn, men RLS
-- avgjør fortsatt hvilke rader som kommer ut. En tom liste er ikke en lekkasje.
