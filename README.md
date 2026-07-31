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
- **Fjelloverganger** — viser typisk sesong for de klassiske overgangene, med tydelig
  merking av at dette er veiledende og lenke til Statens vegvesen.
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
server/           Express-API. Alt mot eksterne tjenester går herfra, med
  routes/         identifiserende User-Agent, cache og rate limiting.
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
