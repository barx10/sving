import type { FerryCrossing, RouteStep } from '../../src/types.js';

/**
 * Turn-by-turn cues, in Norwegian, from whichever engine produced the route —
 * and the ferry crossings along it, which decide both what the rider has to
 * plan around and how long the ride honestly takes.
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
const FERRY = 'Ta ferga';

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

/**
 * Whether the engine was able to say where the ferries are.
 *
 * The distinction is the whole point: "no ferries on this route" and "this
 * engine cannot tell us" look identical in an empty list, and only one of them
 * is safe to plan a Vestlandet tour around.
 */
export type FerryStatus = 'known' | 'unknown';

export interface Directions {
  steps: RouteStep[];
  ferries: FerryCrossing[];
  /** Sailing time only. Waiting for the boat is not something any engine knows. */
  ferrySeconds: number;
  ferryStatus: FerryStatus;
}

export interface OrsSegment {
  steps?: {
    distance?: number;
    duration?: number;
    type?: number;
    name?: string;
    /** Indices into the route geometry: where this step starts and ends. */
    way_points?: number[];
  }[];
}

/** `[startIndex, endIndex, value]` triples over the route geometry. */
export type OrsWaytypeValues = number[][];

export interface OsrmLeg {
  steps?: {
    distance?: number;
    duration?: number;
    name?: string;
    /** "driving" or "ferry" — OSRM says this outright, and it is exact. */
    mode?: string;
    maneuver?: { type?: string; modifier?: string; location?: number[] };
  }[];
}

/** ORS waytype 9 is route=ferry (and shuttle trains, which Norway has none of on road). */
const ORS_WAYTYPE_FERRY = 9;

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

function ferryFrom(step: RouteStep, durationSeconds: number): FerryCrossing {
  return {
    name: step.roadName ?? 'Fergestrekning',
    distanceKm: step.distanceKm,
    crossingMin: Math.round(durationSeconds / 60),
  };
}

/**
 * ORS reports each step's own length and where it sits in the geometry, so the
 * distance a rider reads is measured to the manoeuvre, not from it.
 *
 * Ferries come from the waytype annotation, which has to be asked for
 * separately. When it is missing — and ORS has a long-standing bug where ferry
 * sections come back as waytype 0 rather than 9 — the status says so rather
 * than letting an empty list pass for "no ferries".
 */
export function readOrsDirections(
  segments: OrsSegment[],
  polyline: [number, number][],
  waytypes: OrsWaytypeValues | undefined
): Directions {
  const steps: RouteStep[] = [];
  const ferries: FerryCrossing[] = [];
  let travelledKm = 0;
  let ferrySeconds = 0;

  const ferryRanges = (waytypes ?? []).filter((range) => range[2] === ORS_WAYTYPE_FERRY);
  const isFerryRange = (from: number, to: number): boolean =>
    ferryRanges.some(([start, end]) => from < end && to > start);

  for (const segment of segments) {
    for (const step of segment.steps ?? []) {
      const from = step.way_points?.[0] ?? 0;
      const to = step.way_points?.[1] ?? from;
      const [lat, lng] = pointAt(polyline, from);
      const isFerry = isFerryRange(from, to);

      const built: RouteStep = {
        distanceKm: round1(travelledKm),
        instruction: isFerry ? FERRY : (ORS_INSTRUCTIONS[step.type ?? 6] ?? STRAIGHT),
        roadName: roadName(step.name),
        isFerry,
        lat,
        lng,
      };

      steps.push(built);

      if (isFerry) {
        ferries.push(ferryFrom(built, step.duration ?? 0));
        ferrySeconds += step.duration ?? 0;
      }

      travelledKm += (step.distance ?? 0) / 1000;
    }
  }

  return {
    steps,
    ferries,
    ferrySeconds,
    // No annotation at all means we were not told, which is not the same as
    // being told there are none.
    ferryStatus: waytypes === undefined ? 'unknown' : 'known',
  };
}

/**
 * OSRM's manoeuvre is a type plus a modifier, and which one carries the meaning
 * depends on the type: a "turn" says everything in its modifier, while an
 * "on ramp" says it in the type and uses the modifier only for which side.
 *
 * Ferries need none of that. OSRM marks the step's travel mode outright, which
 * makes this the one engine that answers the question exactly.
 */
export function readOsrmDirections(legs: OsrmLeg[]): Directions {
  const steps: RouteStep[] = [];
  const ferries: FerryCrossing[] = [];
  let travelledKm = 0;
  let ferrySeconds = 0;

  for (const leg of legs) {
    for (const step of leg.steps ?? []) {
      const type = step.maneuver?.type ?? '';
      const modifier = step.maneuver?.modifier ?? '';
      const [lng, lat] = step.maneuver?.location ?? [0, 0];
      const isFerry = step.mode === 'ferry';

      const instruction =
        type === 'turn' || type === 'end of road' || type === 'fork'
          ? (OSRM_MODIFIERS[modifier] ?? OSRM_MANEUVERS[type] ?? STRAIGHT)
          : (OSRM_MANEUVERS[type] ?? OSRM_MODIFIERS[modifier] ?? STRAIGHT);

      const built: RouteStep = {
        distanceKm: round1(travelledKm),
        instruction: isFerry ? FERRY : instruction,
        roadName: roadName(step.name),
        isFerry,
        lat,
        lng,
      };

      steps.push(built);

      if (isFerry) {
        ferries.push(ferryFrom(built, step.duration ?? 0));
        ferrySeconds += step.duration ?? 0;
      }

      travelledKm += (step.distance ?? 0) / 1000;
    }
  }

  return { steps, ferries, ferrySeconds, ferryStatus: 'known' };
}

/** Kilometres of ferry on an OSRM candidate, for the routes that try to avoid them. */
export function ferryKm(legs: OsrmLeg[]): number {
  let km = 0;
  for (const leg of legs) {
    for (const step of leg.steps ?? []) {
      if (step.mode === 'ferry') km += (step.distance ?? 0) / 1000;
    }
  }
  return km;
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
 * So does every ferry — missing one is missing a booking, a queue and a fare.
 */
export function condense(steps: RouteStep[]): RouteStep[] {
  if (steps.length <= 2) return steps;

  const kept: RouteStep[] = [];

  steps.forEach((step, index) => {
    const isEnd = index === 0 || index === steps.length - 1;
    const carriesOn = step.instruction === STRAIGHT;
    const sameRoad = step.roadName !== null && step.roadName === kept[kept.length - 1]?.roadName;

    if (isEnd || step.isFerry || !carriesOn || (!sameRoad && step.roadName !== null)) {
      kept.push(step);
    }
  });

  if (kept.length <= MAX_STEPS) return kept;

  // Still too long: keep every turn, and only turns. A route this involved is
  // better served by a short card that omits the "keep going" cues entirely.
  const turnsOnly = kept.filter(
    (step, index) =>
      index === 0 || index === kept.length - 1 || step.isFerry || step.instruction !== STRAIGHT
  );

  return turnsOnly.slice(0, MAX_STEPS);
}
