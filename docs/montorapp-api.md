# Montørappen — API-kontrakt (v1)

Dette er kontrakten montørappen (Expo, iOS/Android) bygges mot. Alt her er
implementert og testbart i `Devello-app` med `npm run test:app-api`. Appen
trenger ikke vite noe som ikke står her.

- Base-URL: `https://app.devello.no` (lokalt `http://localhost:3000`).
- Alle svar er JSON. Feltnavn er databasens (snake_case). Datoer er ISO
  (`YYYY-MM-DD` for arbeidsdato, ellers tidsstempel med sone).
- `api_version` i `GET /api/app/meg` er `1`. Bump betyr brytende endring.

## Innlogging

Appen logger inn med **Supabase Auth direkte**, med de samme brukerne som
nettappen. Ingen egen auth-ordning, ingen API-nøkler.

```ts
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!);
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
// data.session.access_token → Authorization-header under. supabase-js fornyer tokenet selv.
```

`EXPO_PUBLIC_SUPABASE_URL` og `EXPO_PUBLIC_SUPABASE_ANON_KEY` er de samme
verdiene som nettappens `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`. Anon-nøkkelen
er offentlig — den gir ingenting uten et gyldig JWT, og RLS gjelder.

Hvert kall til API-et sender:

```
Authorization: Bearer <access_token>
```

Tokenet lever ~1 time; supabase-js fornyer det i bakgrunnen med refresh-token.
Bruk alltid `(await supabase.auth.getSession()).data.session?.access_token` rett
før kallet. Utgått eller ugyldig token → `401 { "error": "Ikke innlogget" }`.
Appen sender **ikke** cookies og trenger ikke CORS (native).

## Feilkoder

| Kode | Når | Body |
| --- | --- | --- |
| 400 | Validering (manglende felt, ugyldig verdi, ordren er avsluttet) | `{ "error": "…" }` — tekst som kan vises til montøren |
| 401 | Ikke innlogget / token utgått | `{ "error": "Ikke innlogget" }` |
| 403 | Ordre-modulen er av, eller handlingen gjelder andres føring | `{ "error": "Ordre-modulen er ikke aktivert for dette selskapet." }` / `{ "error": "Du kan bare endre dine egne timer." }` |
| 404 | Ordren, føringen, notatet eller varen finnes ikke i selskapet | `{ "error": "Fant ikke ordren" }` |
| 500 | Uventet | `{ "error": "…" }` |

409 brukes ikke. Alle feiltekster er norsk bokmål og kan vises som de er.

## Idempotens — `client_id`

Appen skal virke uten dekning og sende føringene når nettet er tilbake. Hver
føring (timer, materiell, notat, bilde) får en **`client_id`**: en UUID v4
laget i appen når føringen opprettes lokalt. Regelen:

- Første gang serveren ser `client_id` → **201** med raden.
- Samme `client_id` igjen (uansett hvor mange ganger, uansett om ordren i
  mellomtida er merket ferdig) → **200** med den eksisterende raden. Aldri to
  rader, aldri 409.
- To samtidige kall med samme `client_id` → én får 201, den andre 200. Samme
  rad.
- `client_id` er valgfri. Uten den lages en ny rad hver gang (nettappen).

Behold `client_id` i appens lokale kø til svaret er 200 eller 201; kast
føringen bare på 400/403/404 (og vis feilen). Ved 401 og nettverksfeil: behold
og prøv igjen.

## Rettigheter

`role` fra `GET /api/app/meg` er `admin` eller `standard`. En standardbruker
(montør) kan lese alt i selskapet, føre på alle aktive ordrer, og endre/slette
**egne** timer, materiell og notat. Andres → 403. Admin kan alt.

Ordrestatus `fakturert` og `avbrutt` er avsluttet: alle skrive-kall gir
`400 { "error": "Ordren er avsluttet og kan ikke føres på." }`. `ferdig` kan
fortsatt føres på.

---

## GET /api/app/meg

Første kall etter innlogging. Bruk `timetyper` i timeføringen og
`materials_markup_pct` til å vise salgspris i materiellsøket.

```json
{
  "user": { "id": "uuid", "full_name": "Kari Nordmann", "email": "kari@star.no", "role": "standard" },
  "company": { "id": "uuid", "name": "Star Elektro AS", "materials_markup_pct": 25 },
  "timetyper": [
    { "id": "uuid", "name": "Elektriker", "unit_price": 895 },
    { "id": "uuid", "name": "Lærling", "unit_price": 495 }
  ],
  "api_version": 1
}
```

Feil: 401; 403 når ordre-modulen er av (vis teksten).

```sh
curl -H "Authorization: Bearer $TOKEN" https://app.devello.no/api/app/meg
```

## GET /api/app/ordrar

Ordrelista. `status=aktive` (standard) = `opna`, `paagaar`, `ferdig`.
`status=alle` tar med `fakturert` og `avbrutt`. `q` søker på ordrenummer
(prefiks), tittel og kundenavn. `limit` maks 500, standard 200.

Sortering: `paagaar` først, så `opna`, så `ferdig`; nyest oppdatert øverst
innenfor hver. `mine_timar` er den innloggedes timer på ordren.

```
GET /api/app/ordrar?status=aktive&q=1042&limit=200
```

```json
{
  "ordrar": [
    {
      "id": "uuid",
      "order_no": 1042,
      "status": "paagaar",
      "title": "Bytte sikringsskap",
      "customer_name": "Ola Nordmann",
      "customer_phone": "900 00 000",
      "site_address": "Storgata 12, 5003 Bergen",
      "updated_at": "2026-09-28T07:12:00.000+00:00",
      "mine_timar": 12.5
    }
  ]
}
```

```sh
curl -H "Authorization: Bearer $TOKEN" "https://app.devello.no/api/app/ordrar?status=aktive"
```

## GET /api/app/ordrar/{id}

Én ordre med alt appen viser. `timer` og `materiell` er **alle** på ordren
(montøren skal se kollegaenes), nyest først, maks 200 hver. `bilete` er
opplastede bilder (`order_documents` med `kind = "fil"` og bilde-MIME);
`notat[].bilete` er de som hører til notatet. `lovlege_overgangar` sier
hvilke statuser ordren kan settes til — vis knapp for `paagaar` («Start
jobben») og `ferdig` («Merk som ferdig»), aldri `avbrutt` eller `opna`.

```json
{
  "ordre": {
    "id": "uuid", "company_id": "uuid", "order_no": 1042, "status": "paagaar",
    "title": "Bytte sikringsskap", "description": "…", "description_source": "manuell",
    "customer_name": "Ola Nordmann", "customer_contact": null, "customer_email": null,
    "customer_phone": "900 00 000", "site_address": "Storgata 12, 5003 Bergen",
    "lead_id": null, "draft_id": null, "quote_type": null, "planned_total": null,
    "boligmappa_number": null, "boligmappa_property": null,
    "created_by": "uuid", "created_at": "…", "updated_at": "…", "closed_at": null
  },
  "timer": [
    {
      "id": "uuid", "company_id": "uuid", "order_id": "uuid", "user_id": "uuid", "user_name": "Kari Nordmann",
      "work_date": "2026-09-27", "price_item_id": "uuid", "time_type_name": "Elektriker", "unit_price": 895,
      "hours": 7.5, "note": "Trekking i kjeller", "billable": true, "created_by": "uuid",
      "created_at": "…", "updated_at": "…", "invoice_draft_id": null, "client_id": "uuid"
    }
  ],
  "materiell": [
    {
      "id": "uuid", "company_id": "uuid", "order_id": "uuid", "source": "manuell",
      "supplier_item_id": "uuid", "item_no": "1000270", "name": "PFXP-EX 500V 3G1,5MM²", "unit": "m",
      "quantity": 50, "cost_price": 18.06, "markup_pct": 25, "sale_price": 22.58, "note": null,
      "billable": true, "registered_by": "uuid", "registered_at": "…", "updated_at": "…",
      "invoice_line_id": null, "replaced_by": null, "invoice_draft_id": null, "client_id": "uuid"
    }
  ],
  "notat": [
    {
      "id": "uuid", "company_id": "uuid", "order_id": "uuid", "user_id": "uuid", "user_name": "Kari Nordmann",
      "text": "Gammelt skap hadde skrusikringer. Tok bilde før riving.", "client_id": "uuid",
      "created_at": "…", "updated_at": "…",
      "bilete": [ { "id": "uuid", "title": "IMG_0042", "file_name": "IMG_0042.jpg", "created_at": "…", "note_id": "uuid" } ]
    }
  ],
  "bilete": [ { "id": "uuid", "title": "IMG_0042", "file_name": "IMG_0042.jpg", "created_at": "…", "note_id": "uuid" } ],
  "lovlege_overgangar": ["ferdig", "opna", "avbrutt"]
}
```

`quote_snapshot` er utelatt fra `ordre` (stort, ikke relevant i appen).
`materiell[].source` er `manuell` (ført i appen/nettappen), `faktura`
(fra leverandørfaktura — mengde og kost er låst) eller `pakkseddel`. Linjer
med `replaced_by` satt er erstattet av en fakturalinje og teller ikke i
summer — vis dem nedtonet eller skjul dem. `invoice_draft_id` satt = med på
et overført fakturaforslag, låst.

Feil: 404 ordren finnes ikke i selskapet.

```sh
curl -H "Authorization: Bearer $TOKEN" https://app.devello.no/api/app/ordrar/$ORDER_ID
```

## PATCH /api/orders/{id} — status og tekstfelt

```json
{ "status": "paagaar" }
```

`status` må stå i `lovlege_overgangar`, ellers 400. `fakturert` kan aldri
settes herfra. Tekstfelt kan også endres (`title`, `description`,
`customer_name`, `customer_contact`, `customer_email`, `customer_phone`,
`site_address`). Svar: 200 med ordren.

```sh
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"paagaar"}' https://app.devello.no/api/orders/$ORDER_ID
```

## POST /api/orders — ny ordre uten tilbud

Servicejobb som kom på telefon. Bare `title` er påkrevd.

```json
{ "title": "Bytte stikkontakt", "customer_name": "Ola Nordmann", "customer_phone": "900 00 000", "site_address": "Storgata 12" }
```

Svar: `201 { "id": "uuid", "order_no": 1043 }`.

## POST /api/orders/{id}/timer

```json
{
  "work_date": "2026-09-27",
  "price_item_id": "uuid fra timetyper",
  "hours": 7.5,
  "note": "Trekking i kjeller",
  "client_id": "uuid v4 laget i appen"
}
```

- `work_date` `YYYY-MM-DD`, påkrevd. `hours` 0 < x ≤ 24, påkrevd (`"7,5"`
  godtas). `price_item_id` må være en av `timetyper`. `note` valgfri.
- `user_id` kan sendes av admin for å føre på vegne av andre; standardbruker
  får 403. Uten `user_id` er det alltid en selv.
- Svar: **201** `TimeEntry` (som i `timer[]` over, uten `user_name`), eller
  **200** samme rad når `client_id` er sett fra før.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"work_date":"2026-09-27","price_item_id":"'$TIMETYPE'","hours":7.5,"client_id":"'$(uuidgen)'"}' \
  https://app.devello.no/api/orders/$ORDER_ID/timer
```

### PATCH /api/orders/{id}/timer/{entryId}

Egne timer, eller admin. Felt: `work_date`, `hours`, `note`, `billable`,
`price_item_id`. Fakturerte timer (`invoice_draft_id` satt) → 400. Svar 200.

### DELETE /api/orders/{id}/timer/{entryId}

Egne, eller admin. Svar `200 { "ok": true }`.

## POST /api/orders/{id}/materiell

Fra katalogen (vanlig i appen — søk eller strekkode først):

```json
{ "supplier_item_id": "uuid fra /api/grossist/sok", "quantity": 50, "note": null, "client_id": "uuid" }
```

Fritekst (ikke i katalogen):

```json
{ "name": "Diverse festemateriell", "unit": "stk", "quantity": 1, "sale_price": 250, "client_id": "uuid" }
```

- `quantity` > 0, påkrevd. Fra katalogen kopieres elnummer, navn, enhet og
  kostpris (netto, ellers liste) inn, og salgsprisen regnes med selskapets
  påslag, eller `markup_pct` om det sendes. Fritekst: `name` påkrevd, og
  `sale_price` eller `cost_price` (da regnes salgsprisen med påslag).
- Svar **201** `MaterialEntry`, eller **200** samme rad på gjentatt
  `client_id`. 404 når `supplier_item_id` ikke finnes i selskapets katalog.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"supplier_item_id":"'$ITEM'","quantity":50,"client_id":"'$(uuidgen)'"}' \
  https://app.devello.no/api/orders/$ORDER_ID/materiell
```

### PATCH /api/orders/{id}/materiell/{entryId}

Egne, eller admin. Felt: `quantity`, `markup_pct`, `sale_price`, `note`,
`billable`. Linjer fra faktura kan ikke få endret mengde. Svar 200.

### DELETE /api/orders/{id}/materiell/{entryId}

Egne, eller admin. Svar `200 { "ok": true }`.

## GET /api/grossist/sok — katalog og strekkode

```
GET /api/grossist/sok?q=<tekst | elnummer | EAN>&limit=20
```

- 8–14 siffer som er en GTIN (EAN fra kameraet) → den varen først.
- Bare siffer → prefiks på elnummer. Ellers tekstsøk på navn.
- `limit` maks 50. Tom `q` gir `{ "items": [] }`.

```json
{
  "items": [
    {
      "id": "uuid", "supplier_id": "uuid", "supplier_name": "Onninen",
      "item_no": "1000270", "gtin": "7020160123456", "name": "PFXP-EX 500V 3G1,5MM²", "unit": "m",
      "list_price_per_unit": 123.3, "net_price_per_unit": 18.06
    }
  ]
}
```

Prisene er per måleenhet (kabel per meter). `net_price_per_unit` er null når
grossisten ikke har gitt rabatt; da er kostprisen listeprisen. Salgspris å
vise: `(net ?? list) × (1 + materials_markup_pct / 100)`.

```sh
curl -H "Authorization: Bearer $TOKEN" "https://app.devello.no/api/grossist/sok?q=7020160123456"
```

## POST /api/orders/{id}/notat

```json
{ "text": "Gammelt skap hadde skrusikringer.", "client_id": "uuid" }
```

`text` 1–4000 tegn. Svar **201** `OrderNote` (`id, company_id, order_id,
user_id, text, client_id, created_at, updated_at`), eller **200** samme rad
på gjentatt `client_id`. Bilder knyttes etterpå med `note_id` i
dokument-opplastingen under.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Gammelt skap hadde skrusikringer.","client_id":"'$(uuidgen)'"}' \
  https://app.devello.no/api/orders/$ORDER_ID/notat
```

### DELETE /api/orders/{id}/notat/{noteId}

Egne, eller admin (403 ellers). Bildene blir stående som vanlige dokumenter
på ordren. Svar `200 { "ok": true }`.

## POST /api/orders/{id}/dokumenter — bilde/fil

`multipart/form-data`:

| Felt | | |
| --- | --- | --- |
| `file` | påkrevd | bilde (`image/*`) eller PDF, maks 25 MB. Komprimer bilder i appen (≈1600 px, jpeg 0.8) |
| `title` | valgfri | standard = filnavnet uten endelse |
| `note_id` | valgfri | notatet bildet hører til — må høre til samme ordre, ellers 400 |
| `client_id` | valgfri | idempotens som over |

Svar **201** `OrderDocument` (`id, order_id, kind: "fil", title, file_name,
mime_type, storage_path, note_id, client_id, created_at, …`), eller **200**
på gjentatt `client_id`. Ordre med status `avbrutt` → 400.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@IMG_0042.jpg;type=image/jpeg" -F "title=Skap før riving" -F "note_id=$NOTE_ID" -F "client_id=$(uuidgen)" \
  https://app.devello.no/api/orders/$ORDER_ID/dokumenter
```

I React Native: `formData.append("file", { uri, name: "IMG_0042.jpg", type: "image/jpeg" } as any)`.

## GET /api/orders/{id}/dokumenter/{docId}/fil?format=json

```json
{ "url": "https://….supabase.co/storage/v1/object/sign/…", "expires_in": 300 }
```

`url` er en signert lenke som svarer på GET uten headers i 300 sekunder —
bruk den rett i `<Image source={{ uri: url }}>`. Hent ny når den er utgått.
Uten `format=json` svarer ruta med redirect til samme lenke (nettappen).

```sh
curl -H "Authorization: Bearer $TOKEN" "https://app.devello.no/api/orders/$ORDER_ID/dokumenter/$DOC_ID/fil?format=json"
```

## Anbefalt flyt i appen

1. Innlogging → `GET /api/app/meg` (cache `timetyper` og påslag).
2. `GET /api/app/ordrar` → liste. Pull-to-refresh.
3. Ordre → `GET /api/app/ordrar/{id}`. Knapper fra `lovlege_overgangar`.
4. Føringer legges i en lokal kø med `client_id` og sendes i rekkefølge når
   nettet er tilbake. Notat før bildene som hører til det (bildene trenger
   `note_id` fra svaret).
5. Etter vellykket sending: hent ordren på nytt.
