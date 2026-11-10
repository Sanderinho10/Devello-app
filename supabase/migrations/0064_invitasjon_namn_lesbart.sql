-- Fornamn og etternamn på invitasjonen skal vere lesbare for kollegaer.
--
-- Kvifor: 0018 gjorde invitations lesbar kolonne for kolonne, så tokenet
-- aldri når nettlesaren. 0055 la til fornavn og etternavn utan å ta dei med i
-- lista. Medlemssida spør etter dei, og då avviste Postgres heile spørjinga —
-- ventande invitasjonar vart aldri viste.
--
-- Tokenet er framleis utelate. Kan køyrast fleire gonger.

grant select (fornavn, etternavn) on invitations to authenticated;
