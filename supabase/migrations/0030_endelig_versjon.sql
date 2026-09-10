-- Den endelige versjonen ble aldri logget.
--
-- draft_versions skal ha tre kilder: agentens utkast («ai»), hver redigering,
-- og den endelige versjonen brukeren bekreftet. README lover at «alt blir
-- logget» — det er læringsdataene. Men i produksjonsdatabasen heter den tredje
-- verdien «endeleg» (fra 0001 slik den så ut før appen ble skrevet om fra
-- nynorsk til bokmål), mens koden i confirm/route.ts skriver «endelig».
-- Enum-verdien finnes ikke, insert-en feiler, og feilen ble aldri sjekket.
--
-- Resultat: hvert eneste bekreftede tilbud i piloten har én versjon i loggen,
-- agentens. Hva brukeren faktisk sendte ligger bare i drafts.document og i
-- quote_references — diffen som skulle vist hva agenten bommet på, finnes
-- ikke.
--
-- Migrasjonen i repoet sier «endelig», så en frisk database er riktig. Denne
-- fila retter bare databaser som ble satt opp før omskrivingen, og er ufarlig
-- å kjøre på nytt.

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'draft_version_source' and e.enumlabel = 'endeleg'
  ) then
    alter type draft_version_source rename value 'endeleg' to 'endelig';
  end if;
end $$;
