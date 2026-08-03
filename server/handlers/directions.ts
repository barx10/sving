import type { RouteStep } from '../../src/types.js';

/**
 * Turn-by-turn cues, in Norwegian, from whichever engine produced the route.
 *
 * Both engines describe a manoeuvre with a structured code plus prose of their
 * own. We map the code and write the prose ourselves: OpenRouteService will
 * translate its instructions, but not into Norwegian, and OSRM does not
 * translate at all. Reading the code is also the only way the two engines can
 * be made to say the same thing about the same corner.
 */

const LEFT = 'Ta til venstre';
const RIGHT = 'Ta til høyre';
const STRAIGHT = 'Fortsett rett fram';

/** https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/instruction-types */
const ORS_INSTRUCTIONS: Record<number, string> = {
  0: LEFT,
  1: RIGHT,
  2: 'Skarp sving til venstre',
  3: 'Skarp sving til høyre',
  4: 'Hold litt til venstre',
  5: 'Hold litt til høyre',
  6: STRAIGHT,
  7: 'Inn i rundkjøringen',
  8: 'Ut av rundkjøringen',
  9: 'Snu',
  10: 'Framme',
  11: 'Start',
  12: 'Hold til venstre',
  13: 'Hold til høyre',
};

const OSRM_MODIFIERS: Record<string, string> = {
  left: LEFT,
  right: RIGHT,
  'sharp left': 'Skarp sving til venstre',
  'sharp right': 'Skarp sving til høyre',
  'slight left': 'Hold litt til venstre',
  'slight right': 'Hold litt til høyre',
  straight: STRAIGHT,
  uturn: 'Snu',
};

const OSRM_MANEUVERS: Record<string, string> = {
  depart: 'Start',
  arrive: 'Framme',
  merge: 'Flett inn',
  'on ramp': 'Ta påkjøringsrampen',
  'off ramp': 'Ta av',
  fork: 'Hold til høyre eller venstre i veidelet',
  'end of road': 'Følg veien videre',
  continue: STRAIGHT,
  'new name': STRAIGHT,
  roundabout: 'Inn i rundkjøringen',
  rotary: 'Inn i rundkjøringen',
  'exit roundabout': 'Ut av rundkjøringen',
  'exit rotary': 'Ut av rundkjøringen',
};

export interface OrsSegment {
  steps?: {
    distance?: number;
    type?: number;
    name?: string;
    /** Indices into the route geometry: where this step starts and ends. */
    way_points?: number[];
  }[];
}

export interface OsrmLeg {
  steps?: {
    distance?: number;
    name?: string;
    maneuver?: { type?: string; modifier?: string; location?: number[] };
  }[];
}

/**
 * A road with no name is not worth repeating on a cue card — OSM leaves plenty
 * of Norwegian side roads unnamed, and "" reads as a mistake next to a turn.
 */
function roadName(name: string | undefined): string | null {
  const trimmed = (name ?? '').trim();
  return trimmed === '' || trimmed === '-' ? null : trimmed;
}

function pointAt(polyline: [number, number][], index: number): [number, number] {
  const safe = Math.min(Math.max(index, 0), polyline.length - 1);
  return polyline[safe] ?? [0, 0];
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * ORS reports each step's own length and where it sits in the geometry, so the
 * distance a rider reads is measured to the manoeuvre, not from it.
 */
export function stepsFromOrs(segments: OrsSegment[], polyline: [number, number][]): RouteStep[] {
  const steps: RouteStep[] = [];
  let travelledKm = 0;

  for (const segment of segments) {
    for (const step of segment.steps ?? []) {
      const [lat, lng] = pointAt(polyline, step.way_points?.[0] ?? 0);

      steps.push({
        distanceKm: round1(travelledKm),
        instruction: ORS_INSTRUCTIONS[step.type ?? 6] ?? STRAIGHT,
        roadName: roadName(step.name),
        lat,
        lng,
      });

      travelledKm += (step.distance ?? 0) / 1000;
    }
  }

  return steps;
}

/**
 * OSRM's manoeuvre is a type plus a modifier, and which one carries the meaning
 * depends on the type: a "turn" says everything in its modifier, while an
 * "on ramp" says it in the type and uses the modifier only for which side.
 */
export function stepsFromOsrm(legs: OsrmLeg[]): RouteStep[] {
  const steps: RouteStep[] = [];
  let travelledKm = 0;

  for (const leg of legs) {
    for (const step of leg.steps ?? []) {
      const type = step.maneuver?.type ?? '';
      const modifier = step.maneuver?.modifier ?? '';
      const [lng, lat] = step.maneuver?.location ?? [0, 0];

      const instruction =
        type === 'turn' || type === 'end of road' || type === 'fork'
          ? (OSRM_MODIFIERS[modifier] ?? OSRM_MANEUVERS[type] ?? STRAIGHT)
          : (OSRM_MANEUVERS[type] ?? OSRM_MODIFIERS[modifier] ?? STRAIGHT);

      steps.push({
        distanceKm: round1(travelledKm),
        instruction,
        roadName: roadName(step.name),
        lat,
        lng,
      });

      travelledKm += (step.distance ?? 0) / 1000;
    }
  }

  return steps;
}

/** Past this a cue sheet stops being something a rider reads. */
const MAX_STEPS = 250;

/**
 * Drops the cues a rider does not need. Engines emit a step every time a road
 * changes name or class, so a mountain route arrives with hundreds of "carry
 * straight on" entries between the handful of turns that actually decide where
 * you end up. Anything that is not a turn, and does not put you on a
 * differently named road, is noise on a card read at a petrol pump.
 *
 * The first and last steps always survive: they are the start and the arrival.
 */
export function condense(steps: RouteStep[]): RouteStep[] {
  if (steps.length <= 2) return steps;

  const kept: RouteStep[] = [];

  steps.forEach((step, index) => {
    const isEnd = index === 0 || index === steps.length - 1;
    const carriesOn = step.instruction === STRAIGHT;
    const sameRoad = step.roadName !== null && step.roadName === kept[kept.length - 1]?.roadName;

    if (isEnd || !carriesOn || (!sameRoad && step.roadName !== null)) kept.push(step);
  });

  if (kept.length <= MAX_STEPS) return kept;

  // Still too long: keep every turn, and only turns. A route this involved is
  // better served by a short card that omits the "keep going" cues entirely.
  const turnsOnly = kept.filter(
    (step, index) =>
      index === 0 || index === kept.length - 1 || step.instruction !== STRAIGHT
  );

  return turnsOnly.slice(0, MAX_STEPS);
}
