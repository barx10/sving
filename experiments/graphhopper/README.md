# GraphHopper med curvature — prototyp

Spørsmålet: vil en rutemotor som faktisk optimaliserer for svingethet gi bedre
MC-ruter enn det Sving gjør i dag, der vi ber OSRM eller OpenRouteService om noen
få alternativer og rangerer dem selv etterpå?

Kjørt mot ekte norske veier, 31. juli 2026, med GraphHopper 11.0 og hele
Norge-uttrekket fra Geofabrik. Reproduseres med `./setup.sh`.

## Kort svar

Ja, men ikke der du kanskje tror, og den innebygde MC-modellen må tilpasses
norske forhold før den er til å stole på.

## Hvorfor GraphHopper og ikke OpenRouteService

ORS har verken MC-profil eller noe begrep om svingethet, heller ikke selv-hostet.
GraphHopper 11 leverer begge deler ferdig i jaren:

- `curvature` som encoded value — luftlinje delt på veilengde, 0–1, der lavere er
  svingete. Lagret i grafen med 4 bits.
- `motorcycle.json` — ferdig MC-modell: straffer motorveg og trunk, utelukker
  private veger og traktorveger, senker farten på grus og brostein.
- `curvature.json` — straffer helt rette veger.

## Resultater

MC-profilen (`motorcycle.json` + `curvature.json`) mot en vanlig bilrute, målt med
samme `curvatureDegPerKm` som appen bruker:

| Strekning | Bil km | Bil sving/km | MC km | MC sving/km | Endring |
| --- | ---: | ---: | ---: | ---: | --- |
| Åndalsnes – Valldal | 54,6 | 232,2 | 54,7 | 240,2 | +3 % sving, +0 % lengre |
| Lom – Gaupne | 108,2 | 163,3 | 108,2 | 163,3 | ingen forskjell |
| Sandnes – Lysebotn | 67,9 | 100,0 | 67,9 | 100,0 | ingen forskjell |
| Geiranger – Stryn | 76,0 | 242,9 | 121,2 | 192,6 | **−21 % sving, +59 % lengre** |
| Kristiansand – Stavanger | 226,0 | 95,6 | 274,9 | 183,3 | +92 % sving, +22 % lengre |
| Oslo – Trondheim | 482,2 | 81,5 | 545,1 | 173,0 | +112 % sving, +13 % lengre |
| Oslo – Bergen | 456,5 | 103,6 | 614,9 | 237,4 | +129 % sving, +35 % lengre |

Snitt: 45 % mer svingethet for 18 % lengre veg.

### Det viktigste funnet

**Gevinsten er null på de klassiske fjellovergangene, og stor på lange
transportetapper.**

Trollstigen, Sognefjellet og Lysevegen gir identiske ruter uansett motor — det
finnes bare én veg. Ingen rutemotor kan forbedre et vegnett som ikke har
alternativer. Der appen brukes til å planlegge «Åndalsnes til Geiranger» er dagens
løsning like god.

Forskjellen kommer på Oslo–Bergen, Oslo–Trondheim og Kristiansand–Stavanger, der
en bilmotor legger deg på E16, E6 og E39. Der dobler MC-profilen svingetheten.
Det er nettopp de etappene folk i dag planlegger utenom appen.

### Regresjonen er reell og skyldes norsk vegklassifisering

Geiranger–Stryn ble *dårligere* med den innebygde modellen. Årsaken er at
`motorcycle.json` straffer `road_class == TRUNK` med 0,1 uten unntak. I Norge er
mange av de beste fjellvegene trunk — Rv15 over Strynefjellet er én av dem. En
blank trunk-straff sender rytteren den lange, rettere vegen rundt.

En norsk-tilpasset variant som skiller motorveg fra trunk slår den innebygde på
alle tre strekningene den ble testet på:

| Strekning | Innebygd MC | Norsk-tilpasset |
| --- | ---: | ---: |
| Geiranger – Stryn | +23 % | **+26 %** |
| Oslo – Bergen | +4 % | **+13 %** |
| Åndalsnes – Valldal | +10 % | **+24 %** |

```json
{ "if": "road_class == MOTORWAY", "multiply_by": "0.1" },
{ "if": "road_class == TRUNK",    "multiply_by": "0.7" }
```

### Svingethet er billig å kjøpe

Sving koster overraskende lite omveg når modellen justeres (Åndalsnes–Valldal):

| Variant | km | sving/km | mot utgangspunktet |
| --- | ---: | ---: | --- |
| ingen svingpreferanse | 54,7 | 240,2 | — |
| innebygd `curvature.json` | 55,8 | 264,9 | +10 % sving / +2 % km |
| sterkere | 56,0 | 297,6 | +24 % sving / +2 % km |
| aggressiv | 56,9 | 317,4 | +32 % sving / +4 % km |

32 % mer sving for 4 % lengre veg er en god handel for en MC-tur.

### Ferjer kommer på kjøpet

GraphHopper ruter over ferjesamband og merker dem. Sandnes–Lysebotn:

```
ferry   42,5 km
road    25,3 km
bridge   0,1 km
```

Det gir ikke rutetider, men det sier hvilke etapper som er ferje og hvor lange de
er — mesteparten av verdien i ferje-punktet på veikartet, uten en eneste ny
datakilde.

## Hva det koster å drifte

| | |
| --- | --- |
| Kildedata | 1,3 GB (Geofabrik Norge) |
| Importtid | ~7 min på 4 kjerner |
| Graf på disk | 526 MB |
| Minne i drift | 3,4 GB RSS |
| Svartid, 615 km rute | ~1,0–1,3 s |
| Graf | 2,29 mill. noder, 2,48 mill. kanter |

En VPS med 8 GB RAM holder komfortabelt. 4 GB blir trangt.

Svartiden på rundt ett sekund er brukbar, men ikke rask. Den skyldes at
prototypen kjører med landmarks framfor contraction hierarchies. CH ville gitt
svar på titalls millisekunder, men låser modellen ved import — og det er nettopp
muligheten til å sende custom models per forespørsel som gjør finjusteringen over
mulig. Et fornuftig oppsett er CH på én ferdig innstilt MC-profil, og fleksibel
modus bare når rytteren vil justere selv.

## Konklusjon

Verdt å gjøre, men ikke først. Rekkefølgen bør være:

1. **Nå:** gratis ORS-nøkkel. Null kostnad, ingen drift.
2. **Når appen har brukere som planlegger lange turer:** selv-host GraphHopper med
   den norsk-tilpassede modellen. Da får vi også ferjeetappene gratis.
3. **Ikke:** selv-host OpenRouteService. Samme driftskostnad, ingen av gevinstene.

## Kjør selv

```bash
./setup.sh                                    # henter, importerer, starter
npx tsx experiments/graphhopper/compare.ts    # MC-profil mot bil
npx tsx experiments/graphhopper/tune.ts       # hva koster hvert hakk sving?
npx tsx experiments/graphhopper/diagnose.ts   # regresjonen og svartider
```

Skriptene måler med appens egen `curvatureDegPerKm`, så tallene er direkte
sammenlignbare med det Sving viser rytteren.
