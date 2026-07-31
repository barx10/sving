/**
 * Tunes the curvature preference without rebuilding the graph.
 *
 * The prototype runs with landmarks rather than contraction hierarchies, which
 * means a custom model can be posted per request. That makes it cheap to ask
 * "how much detour does each extra notch of curviness cost?" — the question
 * that actually decides whether a curvy profile is pleasant or annoying.
 */

import { curvatureDegPerKm } from '../../src/utils/geo';

const GH = 'http://127.0.0.1:8989';

/** Åndalsnes to Valldal: Trollstigen, or the flat way round. */
const FROM: [number, number] = [62.5674, 7.6872];
const TO: [number, number] = [62.2983, 7.2612];

interface Variant {
  label: string;
  customModel: Record<string, unknown>;
}

/**
 * Base motorcycle rules, mirroring GraphHopper's bundled motorcycle.json:
 * no private roads or tracks, motorways and trunk roads heavily penalised,
 * slow on loose surfaces.
 */
const motorcycleBase = [
  { if: '!car_access', multiply_by: '0' },
  { if: 'track_type.ordinal() > 1', multiply_by: '0' },
  { if: 'road_access == PRIVATE', multiply_by: '0' },
  { if: 'road_access == DESTINATION', multiply_by: '0.1' },
  { if: 'road_class == MOTORWAY || road_class == TRUNK', multiply_by: '0.1' },
];

const speedRules = [
  { if: 'true', limit_to: '0.9 * car_average_speed' },
  {
    if: 'surface==COBBLESTONE || surface==GRASS || surface==GRAVEL || surface==SAND || surface==PAVING_STONES || surface==DIRT || surface==GROUND || surface==UNPAVED || surface==COMPACTED',
    limit_to: '30',
  },
];

const VARIANTS: Variant[] = [
  {
    label: 'ingen svingpref.',
    customModel: { distance_influence: 90, priority: motorcycleBase, speed: speedRules },
  },
  {
    label: 'innebygd curvature',
    customModel: {
      distance_influence: 90,
      priority: [...motorcycleBase, { if: 'curvature >= 0.98', multiply_by: '0.4' }],
      speed: speedRules,
    },
  },
  {
    label: 'sterkere',
    customModel: {
      distance_influence: 70,
      priority: [
        ...motorcycleBase,
        { if: 'curvature >= 0.98', multiply_by: '0.2' },
        { if: 'curvature >= 0.95 && curvature < 0.98', multiply_by: '0.6' },
      ],
      speed: speedRules,
    },
  },
  {
    label: 'aggressiv',
    customModel: {
      distance_influence: 40,
      priority: [
        ...motorcycleBase,
        { if: 'curvature >= 0.98', multiply_by: '0.1' },
        { if: 'curvature >= 0.95 && curvature < 0.98', multiply_by: '0.4' },
        { if: 'curvature >= 0.90 && curvature < 0.95', multiply_by: '0.8' },
      ],
      speed: speedRules,
    },
  },
];

async function routeWith(customModel: Record<string, unknown>) {
  const response = await fetch(`${GH}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [
        [FROM[1], FROM[0]],
        [TO[1], TO[0]],
      ],
      profile: 'mc_curvy',
      // Landmarks were prepared with distance_influence 90 and refuse any query
      // model that would allow longer routes than that. Turning them off falls
      // back to flexible routing, which accepts any model — slower per query,
      // but this is exactly the knob we are trying to measure.
      'lm.disable': true,
      'ch.disable': true,
      custom_model: customModel,
      points_encoded: false,
      instructions: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    paths?: { distance: number; time: number; points: { coordinates: [number, number][] } }[];
  };
  const path = data.paths?.[0];
  if (!path) throw new Error('ingen rute');

  const line: [number, number][] = path.points.coordinates.map(([lng, lat]) => [lat, lng]);
  return { km: path.distance / 1000, minutes: path.time / 60000, curvature: curvatureDegPerKm(line) };
}

console.log('\nHvor mye omveg koster hvert hakk med svingethet?');
console.log('Åndalsnes – Valldal (Trollstigen eller den flate vegen rundt)\n');
console.log('variant'.padEnd(22), 'km'.padStart(8), 'min'.padStart(7), 'sving/km'.padStart(10));
console.log('-'.repeat(50));

let baseline: { km: number; curvature: number } | null = null;

for (const variant of VARIANTS) {
  try {
    const result = await routeWith(variant.customModel);
    baseline ??= result;

    const extraKm = ((result.km - baseline.km) / baseline.km) * 100;
    const extraCurve = ((result.curvature - baseline.curvature) / baseline.curvature) * 100;

    console.log(
      variant.label.padEnd(22),
      result.km.toFixed(1).padStart(8),
      result.minutes.toFixed(0).padStart(7),
      result.curvature.toFixed(1).padStart(10),
      baseline === result ? '' : `  ${extraCurve >= 0 ? '+' : ''}${extraCurve.toFixed(0)} % sving / ${extraKm >= 0 ? '+' : ''}${extraKm.toFixed(0)} % km`
    );
  } catch (err) {
    console.log(variant.label.padEnd(22), 'FEIL:', (err as Error).message);
  }
}

console.log();
