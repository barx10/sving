/**
 * Compares GraphHopper's curvature-aware motorcycle profile against a plain car
 * route on real Norwegian roads.
 *
 * `car_plain` stands in for what we get today: ORS and OSRM both route a car,
 * and neither has any notion of curvature. The question this answers is whether
 * a curvature-aware engine finds meaningfully twistier roads, or whether our
 * current approach — asking for alternatives and ranking them ourselves — is
 * already good enough to not bother self-hosting.
 *
 * Scored with the exact same metric the app uses, so the numbers are comparable
 * to what Sving already reports to riders.
 */

import { curvatureDegPerKm, polylineLengthKm } from '../../src/utils/geo';

const GH = 'http://127.0.0.1:8989';

interface TestRoute {
  name: string;
  note: string;
  from: [number, number];
  to: [number, number];
}

const ROUTES: TestRoute[] = [
  {
    name: 'Åndalsnes – Valldal',
    note: 'Trollstigen, eller den flate vegen rundt',
    from: [62.5674, 7.6872],
    to: [62.2983, 7.2612],
  },
  {
    name: 'Lom – Gaupne',
    note: 'Sognefjellet',
    from: [61.8383, 8.5683],
    to: [61.4072, 7.2944],
  },
  {
    name: 'Oslo – Bergen',
    note: 'Lang tur der bil vil på E16/E134',
    from: [59.9139, 10.7522],
    to: [60.3913, 5.3221],
  },
  {
    name: 'Sandnes – Lysebotn',
    note: 'Lysevegen med 27 hårnålssvinger',
    from: [58.8524, 5.7352],
    to: [59.0558, 6.6508],
  },
  {
    name: 'Geiranger – Stryn',
    note: 'Strynefjellet eller om Grotli',
    from: [62.0998, 7.2056],
    to: [61.911, 6.716],
  },
  {
    name: 'Oslo – Trondheim',
    note: 'E6, Rv3 eller Gudbrandsdalen',
    from: [59.9139, 10.7522],
    to: [63.4305, 10.3951],
  },
  {
    name: 'Kristiansand – Stavanger',
    note: 'E39 langs kysten, eller innom Setesdal',
    from: [58.1467, 7.9956],
    to: [58.97, 5.7331],
  },
];

interface GhPath {
  distance: number;
  time: number;
  points: { coordinates: [number, number][] };
}

async function route(profile: string, from: [number, number], to: [number, number]) {
  const url =
    `${GH}/route?point=${from[0]},${from[1]}&point=${to[0]},${to[1]}` +
    `&profile=${profile}&points_encoded=false&instructions=false&calc_points=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${profile}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }

  const data = (await response.json()) as { paths?: GhPath[] };
  const path = data.paths?.[0];
  if (!path) throw new Error(`${profile}: ingen rute funnet`);

  // GraphHopper returns GeoJSON order [lng, lat]; our metric wants [lat, lng].
  const line: [number, number][] = path.points.coordinates.map(([lng, lat]) => [lat, lng]);

  return {
    km: path.distance / 1000,
    minutes: path.time / 60000,
    curvature: curvatureDegPerKm(line),
    points: line.length,
    measuredKm: polylineLengthKm(line),
  };
}

const pad = (s: string, n: number) => s.padEnd(n);
const num = (v: number, n: number, d = 0) => v.toFixed(d).padStart(n);

console.log('\nGraphHopper: svingete MC-profil vs vanlig bilrute\n');
console.log(
  pad('Rute', 24),
  pad('Profil', 11),
  num2('km'),
  num2('min'),
  num2('sving/km'),
  'endring'
);
console.log('-'.repeat(78));

function num2(s: string) {
  return s.padStart(9);
}

let totalCurvyGain = 0;
let totalDetour = 0;
let compared = 0;

for (const test of ROUTES) {
  try {
    const [curvy, plain] = await Promise.all([
      route('mc_curvy', test.from, test.to),
      route('car_plain', test.from, test.to),
    ]);

    const curvatureGain = ((curvy.curvature - plain.curvature) / plain.curvature) * 100;
    const detour = ((curvy.km - plain.km) / plain.km) * 100;

    totalCurvyGain += curvatureGain;
    totalDetour += detour;
    compared++;

    console.log(
      pad(test.name, 24),
      pad('bil', 11),
      num(plain.km, 9, 1),
      num(plain.minutes, 9, 0),
      num(plain.curvature, 9, 1),
      ''
    );
    console.log(
      pad('', 24),
      pad('mc_curvy', 11),
      num(curvy.km, 9, 1),
      num(curvy.minutes, 9, 0),
      num(curvy.curvature, 9, 1),
      `  ${curvatureGain >= 0 ? '+' : ''}${curvatureGain.toFixed(0)} % sving, ${detour >= 0 ? '+' : ''}${detour.toFixed(0)} % lengre`
    );
    console.log(pad(`  (${test.note})`, 24));
    console.log();
  } catch (err) {
    console.log(pad(test.name, 24), 'FEIL:', (err as Error).message);
    console.log();
  }
}

if (compared > 0) {
  console.log('-'.repeat(78));
  console.log(
    `Snitt over ${compared} ruter: ${(totalCurvyGain / compared).toFixed(0)} % mer svingethet ` +
      `for ${(totalDetour / compared).toFixed(0)} % lengre veg.`
  );
}
console.log();
