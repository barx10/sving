/**
 * Curated list of the mountain passes that matter most to motorcyclists in Norway,
 * with the dates they *typically* open and close in a normal year.
 *
 * IMPORTANT: this is reference data, not a live feed. Opening dates move by weeks
 * depending on snow, and any pass can close at an hour's notice for weather or
 * roadworks. Everything derived from this file must be presented as guidance and
 * must point the rider at Statens vegvesen before they set off.
 *
 * If a live Vegvesen feed is wired up later, it should override `status` here
 * rather than replace this file — the typical season is still useful for planning
 * a trip months ahead, which is exactly when no live feed has anything to say.
 */

export type PassStatus = 'open' | 'closed_seasonal' | 'uncertain';

export interface MountainPass {
  id: string;
  name: string;
  /** Road number as signed, e.g. "Fv63". */
  road: string;
  description: string;
  lat: number;
  lng: number;
  /** Highest point of the pass, metres above sea level. */
  summitM?: number;
  /** Typical opening date in a normal year, as [month, day] with month 1-indexed. */
  typicalOpen?: [number, number];
  /** Typical closing date in a normal year, as [month, day]. */
  typicalClose?: [number, number];
  /** Roads that are normally kept open year round, weather permitting. */
  yearRound?: boolean;
  /** Anything a rider should know beyond the season, shown verbatim in the UI. */
  note?: string;
}

/** Where riders should check the actual, current status before departure. */
export const VEGVESEN_STATUS_URL = 'https://www.vegvesen.no/trafikkbeskjeder/';

/** How close to the typical open/close date before we stop claiming to know. */
const SHOULDER_DAYS = 14;

const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/**
 * Day-of-year on a fixed 365-day calendar. Leap years shift this by a day after
 * February, which is irrelevant against a two-week shoulder window.
 */
function dayOfYear(month: number, day: number): number {
  return DAYS_BEFORE_MONTH[month - 1] + day;
}

const MONTH_NAMES_NO = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

export function formatSeasonDate([month, day]: [number, number]): string {
  return `${day}. ${MONTH_NAMES_NO[month - 1]}`;
}

export interface PassStatusResult {
  status: PassStatus;
  /** Short label for chips and markers. */
  label: string;
  /** One sentence explaining what the label is based on. */
  detail: string;
}

/**
 * Works out whether a pass is likely open, based only on the calendar.
 * Deliberately returns 'uncertain' rather than guessing near the season edges,
 * which is when riders are most likely to get caught out.
 */
export function passStatus(pass: MountainPass, now: Date = new Date()): PassStatusResult {
  const today = dayOfYear(now.getMonth() + 1, now.getDate());

  if (pass.yearRound || !pass.typicalOpen || !pass.typicalClose) {
    const inWinter = today >= dayOfYear(11, 1) || today <= dayOfYear(4, 15);
    return {
      status: 'open',
      label: inWinter ? 'Normalt åpen – vinterforhold' : 'Normalt åpen',
      detail: inWinter
        ? 'Holdes normalt åpen hele året, men stenger ofte ved uvær og kan ha kolonnekjøring.'
        : 'Holdes normalt åpen hele året.',
    };
  }

  const opens = dayOfYear(...pass.typicalOpen);
  const closes = dayOfYear(...pass.typicalClose);
  const season = `Åpner normalt ${formatSeasonDate(pass.typicalOpen)}, stenger normalt ${formatSeasonDate(pass.typicalClose)}.`;

  if (today >= opens + SHOULDER_DAYS && today <= closes - SHOULDER_DAYS) {
    return { status: 'open', label: 'Normalt åpen', detail: season };
  }

  if (today < opens - SHOULDER_DAYS || today > closes + SHOULDER_DAYS) {
    return { status: 'closed_seasonal', label: 'Normalt vinterstengt', detail: season };
  }

  return {
    status: 'uncertain',
    label: 'Usikkert – åpner/stenger nå',
    detail: `${season} Du er midt i skiftet, så status kan endre seg fra dag til dag.`,
  };
}

export const MOUNTAIN_PASSES: MountainPass[] = [
  {
    id: 'trollstigen',
    name: 'Trollstigen',
    road: 'Fv63',
    description: 'Nasjonal turistveg med 11 hårnålssvinger mellom Åndalsnes og Valldal.',
    lat: 62.4572,
    lng: 7.6711,
    summitM: 858,
    typicalOpen: [5, 20],
    typicalClose: [10, 15],
    note: 'Har vært stengt utover ordinær sesong på grunn av rasfare. Sjekk status før du planlegger turen hit.',
  },
  {
    id: 'sognefjellet',
    name: 'Sognefjellet',
    road: 'Fv55',
    description: 'Nord-Europas høyeste fjellovergang, mellom Lom og Gaupne.',
    lat: 61.5647,
    lng: 7.9944,
    summitM: 1434,
    typicalOpen: [5, 1],
    typicalClose: [11, 30],
    note: 'Kan ha nattestenging og kolonnekjøring i ytterkantene av sesongen.',
  },
  {
    id: 'dalsnibba',
    name: 'Nibbevegen (Dalsnibba)',
    road: 'Fv63 / bomveg',
    description: 'Bomveg opp til utsiktspunktet over Geirangerfjorden.',
    lat: 62.0494,
    lng: 7.2708,
    summitM: 1476,
    typicalOpen: [5, 15],
    typicalClose: [10, 15],
    note: 'Bompengeveg. Åpningen avhenger helt av brøyting og snømengde.',
  },
  {
    id: 'valdresflye',
    name: 'Valdresflye',
    road: 'Fv51',
    description: 'Høyfjellsovergang med Jotunheimen-panorama mellom Beitostølen og Garmo.',
    lat: 61.3739,
    lng: 8.7997,
    summitM: 1389,
    yearRound: true,
    note: 'Brøytes gjennom vinteren, men stenger ved uvær. Vinterstengt for enkelte kjøretøy.',
  },
  {
    id: 'aurlandsfjellet',
    name: 'Aurlandsfjellet (Snøvegen)',
    road: 'Fv5627',
    description: 'Nasjonal turistveg over fjellet mellom Aurland og Lærdal, via Stegastein.',
    lat: 60.9167,
    lng: 7.35,
    summitM: 1306,
    typicalOpen: [6, 1],
    typicalClose: [10, 15],
    note: 'Stegastein utsiktspunkt nås fra Aurland-siden og er åpent lenger enn selve fjellovergangen.',
  },
  {
    id: 'strynefjellet_gamle',
    name: 'Gamle Strynefjellsvegen',
    road: 'Fv258',
    description: 'Historisk turistveg med smal, delvis grusdekt trasé over Strynefjellet.',
    lat: 61.9612,
    lng: 7.4258,
    summitM: 1139,
    typicalOpen: [6, 1],
    typicalClose: [10, 15],
    note: 'Smal veg med møteplasser og partier med grus. Rv15 gjennom tunnelene er åpen hele året.',
  },
  {
    id: 'lysevegen',
    name: 'Lysevegen (Lysebotn)',
    road: 'Fv4224',
    description: '27 hårnålssvinger ned til Lysebotn ved Lysefjorden.',
    lat: 59.0558,
    lng: 6.6508,
    summitM: 932,
    typicalOpen: [6, 1],
    typicalClose: [11, 1],
    note: 'Bratt nedstigning med tunnel i sving. Ferje fra Lysebotn må bookes separat.',
  },
  {
    id: 'brokke_suleskard',
    name: 'Brokke – Suleskard',
    road: 'Fv450',
    description: 'Høyfjellsveg mellom Setesdal og Sirdal.',
    lat: 59.04,
    lng: 7.28,
    summitM: 1050,
    typicalOpen: [6, 1],
    typicalClose: [10, 31],
  },
  {
    id: 'gaularfjellet',
    name: 'Gaularfjellet',
    road: 'Fv613',
    description: 'Nasjonal turistveg med svingete oppstigning til utsiktspunktet Utsikten.',
    lat: 61.3789,
    lng: 6.3156,
    summitM: 750,
    typicalOpen: [6, 1],
    typicalClose: [10, 15],
  },
  {
    id: 'hardangervidda',
    name: 'Hardangervidda',
    road: 'Rv7',
    description: 'Høyfjellsovergang over vidda mellom Eidfjord og Geilo.',
    lat: 60.5486,
    lng: 7.5222,
    summitM: 1250,
    yearRound: true,
    note: 'Åpen hele året, men blant de vegene som oftest stenger eller får kolonnekjøring om vinteren.',
  },
  {
    id: 'haukelifjell',
    name: 'Haukelifjell',
    road: 'E134',
    description: 'Hovedovergang mellom Østlandet og Vestlandet.',
    lat: 59.8167,
    lng: 7.2167,
    summitM: 1085,
    yearRound: true,
    note: 'Åpen hele året. Vinterstengning og kolonnekjøring forekommer ved uvær.',
  },
];
