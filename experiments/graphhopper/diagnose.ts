/**
 * Two things the headline comparison left open.
 *
 * 1. Geiranger–Stryn came out 21 % *less* curvy and 59 % longer with the
 *    motorcycle profile — a regression. The suspect is the bundled model's
 *    blanket `road_class == TRUNK -> 0.1`. In Norway a lot of the best
 *    mountain roads are trunk roads: Rv15 over Strynefjellet is a trunk road,
 *    and so are large parts of Rv7 and E134. Avoiding trunk wholesale sends the
 *    rider the long way round on a straighter road.
 *
 * 2. Query latency, which decides whether this is usable behind the app.
 */

import { curvatureDegPerKm } from '../../src/utils/geo';

const GH = 'http://127.0.0.1:8989';

const base = [
  { if: '!car_access', multiply_by: '0' },
  { if: 'track_type.ordinal() > 1', multiply_by: '0' },
  { if: 'road_access == PRIVATE', multiply_by: '0' },
  { if: 'road_access == DESTINATION', multiply_by: '0.1' },
];

const speed = [
  { if: 'true', limit_to: '0.9 * car_average_speed' },
  {
    if: 'surface==COBBLESTONE || surface==GRASS || surface==GRAVEL || surface==SAND || surface==PAVING_STONES || surface==DIRT || surface==GROUND || surface==UNPAVED || surface==COMPACTED',
    limit_to: '30',
  },
];

const curvy = [
  { if: 'curvature >= 0.98', multiply_by: '0.2' },
  { if: 'curvature >= 0.95 && curvature < 0.98', multiply_by: '0.6' },
];

const MODELS: Record<string, Record<string, unknown>> = {
  bil: { distance_influence: 90, priority: base, speed },

  'innebygd mc': {
    distance_influence: 90,
    priority: [
      ...base,
      { if: 'road_class == MOTORWAY || road_class == TRUNK', multiply_by: '0.1' },
      { if: 'curvature >= 0.98', multiply_by: '0.4' },
    ],
    speed,
  },

  'norsk-tilpasset': {
    distance_influence: 90,
    priority: [
      ...base,
      // Motorways are genuinely dull; trunk roads in Norway are often the only
      // way across a mountain, so they get discouraged rather than shunned.
      { if: 'road_class == MOTORWAY', multiply_by: '0.1' },
      { if: 'road_class == TRUNK', multiply_by: '0.7' },
      ...curvy,
    ],
    speed,
  },
};

interface Leg {
  name: string;
  from: [number, number];
  to: [number, number];
}

const LEGS: Leg[] = [
  { name: 'Geiranger – Stryn', from: [62.0998, 7.2056], to: [61.911, 6.716] },
  { name: 'Oslo – Bergen', from: [59.9139, 10.7522], to: [60.3913, 5.3221] },
  { name: 'Åndalsnes – Valldal', from: [62.5674, 7.6872], to: [62.2983, 7.2612] },
];

async function run(model: Record<string, unknown>, leg: Leg, useLandmarks: boolean) {
  const started = Date.now();
  const response = await fetch(`${GH}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [
        [leg.from[1], leg.from[0]],
        [leg.to[1], leg.to[0]],
      ],
      profile: 'mc_curvy',
      'ch.disable': true,
      'lm.disable': !useLandmarks,
      custom_model: model,
      points_encoded: false,
      instructions: false,
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);

  const data = (await response.json()) as {
    paths?: { distance: number; time: number; points: { coordinates: [number, number][] } }[];
  };
  const path = data.paths![0];
  const line: [number, number][] = path.points.coordinates.map(([lng, lat]) => [lat, lng]);

  return {
    km: path.distance / 1000,
    curvature: curvatureDegPerKm(line),
    ms: Date.now() - started,
  };
}

console.log('\nSlår den norske tilpasningen ut regresjonen?\n');
console.log('strekning'.padEnd(22), 'modell'.padEnd(18), 'km'.padStart(8), 'sving/km'.padStart(10));
console.log('-'.repeat(62));

for (const leg of LEGS) {
  let carBaseline = 0;
  for (const [label, model] of Object.entries(MODELS)) {
    const r = await run(model, leg, false);
    if (label === 'bil') carBaseline = r.curvature;
    const delta = label === 'bil' ? '' : `  ${r.curvature >= carBaseline ? '+' : ''}${(((r.curvature - carBaseline) / carBaseline) * 100).toFixed(0)} % mot bil`;
    console.log(
      (label === 'bil' ? leg.name : '').padEnd(22),
      label.padEnd(18),
      r.km.toFixed(1).padStart(8),
      r.curvature.toFixed(1).padStart(10),
      delta
    );
  }
  console.log();
}

console.log('Svartid (Oslo – Bergen, 615 km):');
const leg = LEGS[1];
for (const useLm of [true, false]) {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) times.push((await run(MODELS['innebygd mc'], leg, useLm)).ms);
  const label = useLm ? 'med landmarks' : 'ren fleksibel';
  console.log(`  ${label.padEnd(16)} ${Math.min(...times)} ms (beste av 3)`);
}
console.log();
