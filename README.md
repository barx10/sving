# Sving

Norsk MC-turplanlegger for svingete og naturskjønne veier. Gratis, uten konto og uten sporing.

Planlegg en tur, se hvor svingete den faktisk er, få værvarsel for tidspunktet du er
framme ved hvert punkt, og ta ruten med videre som GPX eller lenke.

## Hva den gjør

- **Ruting for MC** — velger rute etter hvor svingete den er (målt i grader retningsendring
  per kilometer), ikke bare hvor lang den er. Kan unngå motorvei.
- **Vær ved ankomst** — henter varsel fra MET.no for det klokkeslettet du beregnes å være
  framme ved hvert sjekkpunkt, ikke for da du trykket på knappen. Flagger kulde, nedbør
  og vindkast.
- **Fjelloverganger** — en sammenleggbar liste under «Beregn rute» viser typisk sesong
  for de klassiske overgangene. Trykk på en overgang for å se den i kartet. Tydelig
  merket som veiledende, med lenke til Statens vegvesen.
- **Høydeprofil** — reell høydedata fra Copernicus DEM via Open-Meteo.
- **Eksport** — GPX for Garmin/OsmAnd, deep links til Google Maps og Apple Maps, og en
  delbar lenke som inneholder hele ruten.
- **Offline** — installerbar som app. Kartfliser du har sett lagres, så kartet fungerer
  der dekningen ikke gjør det.
- **Lagrede turer** — lagres lokalt i nettleseren. Ingenting sendes til en server.

## Kom i gang

```bash
bun install          # eller: npm install
cp .env.example .env # fyll inn CONTACT_EMAIL
bun run dev          # http://localhost:3000
```

```bash
bun run typecheck    # TypeScript
bun run test         # enhetstester
bun run build        # bygger klient til dist/ og server til build/
bun run start        # kjører produksjonsbygget
```

### Konfigurasjon

Alt settes via miljøvariabler, se [`.env.example`](.env.example). Den viktigste er
`CONTACT_EMAIL`: både MET.no og Nominatim ber om en kontaktadresse i `User-Agent`, og
kan blokkere trafikk uten. `OPENROUTESERVICE_API_KEY` er valgfri, men gir bedre ruting
for motorsykkel.

## Drift

Samme kodebase kjører på to måter — logikken bak `/api` ligger i `server/handlers/`
og deles av begge:

**Vercel (nåværende hosting).** `api/`-mappa blir serverless functions automatisk,
og `vercel.json` peker bygget på riktig sted (region `arn1`, Stockholm — nærmest
både brukerne og MET.no). Sett `CONTACT_EMAIL` og eventuelt
`OPENROUTESERVICE_API_KEY` som miljøvariabler i Vercel-dashbordet. Merk: på
serverless gjelder minne-cache og Nominatim-strupingen per varm instans, ikke
globalt — edge-caching på geocoding-svarene demper det, men ved høy trafikk er en
egen server snillere mot Nominatim.

**Egen server / VPS.** `npm run build && npm start` kjører Express-serveren med
full cache, global Nominatim-struping og rate limiting per IP. Dette er også
oppsettet som senere kan få en selv-hostet GraphHopper ved siden av seg (se
`experiments/graphhopper/`).

## Om datakildene

Appen skal aldri finne på data. Der en kilde ikke svarer, sier den at den ikke vet,
i stedet for å gjette:

| Data | Kilde | Merk |
| --- | --- | --- |
| Ruting | OpenRouteService (med nøkkel) eller OSRM | Kjøretid er et estimat, uten ferje og pauser |
| Svingethet | Beregnet av oss fra rutegeometrien | Grader retningsendring per km. Ingen rutemotor vi bruker tilbyr MC-profil, så alternativene rangeres av oss |
| Høyde | Open-Meteo (Copernicus DEM 30 m), reserve: Open-Elevation | Utelates helt hvis begge feiler |
| Vær | MET.no Locationforecast 2.0 | Vises som utilgjengelig hvis MET.no ikke svarer |
| Stedsnavn | Nominatim (OpenStreetMap) | Går via egen server med rate limiting og cache |
| Kart | Kartverket og CARTO / OpenStreetMap | |
| Fjelloverganger | Kuratert liste i `src/data/mountainPasses.ts` | **Ikke sanntid.** Beregnet fra typiske sesongdatoer |

**Statusen for fjelloverganger er en kalendermodell, ikke et sanntidsvarsel.** En
fjellovergang kan stenge på timers varsel. Sjekk alltid
[Statens vegvesen](https://www.vegvesen.no/trafikkbeskjeder/) før avreise.

## Arkitektur

```
api/              Vercel serverless-innganger — tynne adaptere, én per endepunkt.
server/
  handlers/       All API-logikk, vertsnøytral. Delt av api/ og Express.
  routes/         Tynne Express-adaptere rundt handlers.
src/              React-klient (Vite, Tailwind, Leaflet, Dexie).
  data/           Kuratert innhold: forhåndsdefinerte ruter, fjelloverganger.
  utils/          Delt logikk, brukt av både klient og server.
scripts/          Genererer PWA-ikoner.
```

Kode i `src/utils/` og `src/data/` er isomorf og importeres av begge sider, slik at
for eksempel avstandsberegning finnes ett sted.

## Bidra

Forslag til nye ruter i `src/data/presetRoutes.ts` og korreksjoner til sesongdatoene i
`src/data/mountainPasses.ts` er spesielt velkomne — den slags er det folk som kjører
veiene som vet best.

## Lisens

MIT, se [LICENSE](LICENSE).
