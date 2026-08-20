-- Permanent læring utsatt.
--
-- agent_lessons lot agenten skrive varige regler til seg selv ut fra
-- rettelsene den fikk. Den ble tatt ut igjen før den rakk å bli brukt: vi
-- kjører først den enklere sløyfa — lagre utkastet før og etter endring,
-- tagge det, og lese de relevante tilbudene før neste generering — og ser
-- hvor langt den kommer alene.
--
-- Det som blir igjen er nok til å ta læringen opp senere: draft_versions har
-- hver versjon med diff, quote_references har den endelige teksten med tags,
-- og edit_summary sier hva brukeren endret. Datagrunnlaget står; det er bare
-- regelskrivingen som er utsatt.
--
-- Tabellen var tom da den ble fjernet.

drop table if exists agent_lessons;
drop type if exists lesson_status;
