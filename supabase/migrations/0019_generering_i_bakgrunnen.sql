-- Genereringen skal kunne gå mens brukeren gjør noe annet.
--
-- Før dette sto man i popupen og så på en spinner i et minutt mens agenten
-- jobbet. Nå legger henvendelsen seg som en linje i listen med én gang, og
-- genereringen skjer i bakgrunnen — da kan man skrive inn neste telefonjobb
-- i mellomtiden.
--
-- Statusen «genererer» er det som gjør linjen ærlig: uten den ville et lead
-- ligget som «ny» mens agenten faktisk holdt på, og den eneste måten å vite
-- forskjellen på ville vært å trykke og se.

alter type lead_status add value 'genererer' before 'utkast_klar';

-- Feiler genereringen, må linjen kunne si hvorfor. Alternativet er et lead
-- som stille går tilbake til «ny» og en bruker som trykker generer igjen uten
-- å vite at det var prisfilen som manglet.
alter table leads add column generation_error text;
