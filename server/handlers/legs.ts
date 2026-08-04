import type { FerryCrossing, RouteStep } from '../../src/types.js';
import { cumulativeDistancesKm } from '../../src/utils/geo.js';
import type { FerryStatus } from './directions.js';

/**
 * A route planned one leg at a time, then joined back together.
 *
 * Both routing engines only offer alternative routes for a plain A-to-B
 * request. Ask either of them for a route through via points and you get
 * exactly one answer — so the curvature ranking, which is the whole reason this
 * app exists, had nothing to choose between the moment a rider added a stop.
 * The riding style and the motorway switch quietly stopped meaning anything on
 * precisely the routes people plan most carefully.
 *
 * Routing each leg separately gets the alternatives back. The cost is one
 * upstream request per leg instead of one per route, which the leg cache and
 * the ranking window keep in proportion.
 */

export interface RouteLeg {
  polyline: [number, number][];
  distanceM: number;
  durationS: number;
  /** Distances measured from this leg's own start; stitching offsets them. */
  steps: RouteStep[];
  ferries: FerryCrossing[];
  ferrySeconds: number;
  ferryStatus: FerryStatus;
  /** One per polyline point, when the engine supplied them. */
  elevations: number[] | null;
}

/**
 * Joins legs into one route.
 *
 * Two details decide whether the result reads like a single ride. The joint
 * itself is one shared point — each leg starts where the last ended — so the
 * duplicate is dropped, otherwise the elevation profile gets a zero-length step
 * at every via point. And each leg carries its own "Start" and "Framme": kept
 * as they are, a three-leg route would announce that you have arrived twice
 * before you have.
 */
export function stitchLegs(legs: RouteLeg[]): RouteLeg {
  if (legs.length === 0) {
    return {
      polyline: [],
      distanceM: 0,
      durationS: 0,
      steps: [],
      ferries: [],
      ferrySeconds: 0,
      ferryStatus: 'known',
      elevations: null,
    };
  }

  if (legs.length === 1) return legs[0];

  const polyline: [number, number][] = [];
  const steps: RouteStep[] = [];
  const ferries: FerryCrossing[] = [];
  const elevations: number[] = [];

  let distanceM = 0;
  let durationS = 0;
  let ferrySeconds = 0;
  let everyLegHasElevation = true;

  legs.forEach((leg, index) => {
    const isFirst = index === 0;
    const isLast = index === legs.length - 1;
    const offsetKm = distanceM / 1000;

    // The joint is one point, not two.
    const points = isFirst ? leg.polyline : leg.polyline.slice(1);
    polyline.push(...points);

    if (leg.elevations && leg.elevations.length === leg.polyline.length) {
      elevations.push(...(isFirst ? leg.elevations : leg.elevations.slice(1)));
    } else {
      everyLegHasElevation = false;
    }

    // Drop the arrival of every leg but the last, and the departure of every
    // leg but the first: mid-route they describe a via point, not a journey.
    const from = isFirst ? 0 : 1;
    const to = isLast ? leg.steps.length : Math.max(from, leg.steps.length - 1);

    for (const step of leg.steps.slice(from, to)) {
      steps.push({ ...step, distanceKm: round1(step.distanceKm + offsetKm) });
    }

    for (const ferry of leg.ferries) {
      ferries.push({ ...ferry, distanceKm: round1(ferry.distanceKm + offsetKm) });
    }

    distanceM += leg.distanceM;
    durationS += leg.durationS;
    ferrySeconds += leg.ferrySeconds;
  });

  return {
    polyline,
    distanceM,
    durationS,
    steps,
    ferries,
    ferrySeconds,
    // One leg the engine could not describe leaves the whole route uncertain:
    // the ferry we were not told about could be on any of them.
    ferryStatus: legs.every((leg) => leg.ferryStatus === 'known') ? 'known' : 'unknown',
    elevations: everyLegHasElevation && elevations.length === polyline.length ? elevations : null,
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** The consecutive pairs a multi-point route is made of. */
export function legPairs(
  coordinates: [number, number][]
): [[number, number], [number, number]][] {
  const pairs: [[number, number], [number, number]][] = [];
  for (let i = 0; i < coordinates.length - 1; i++) {
    pairs.push([coordinates[i], coordinates[i + 1]]);
  }
  return pairs;
}

/**
 * Whether routing leg by leg would buy the rider anything.
 *
 * With two points there is only one leg, and the ordinary request already asks
 * for alternatives — splitting would cost a request and change nothing. And
 * with no preference to express, every candidate scores the same, so the extra
 * requests would buy the engine's first suggestion at N times the price.
 */
export function shouldRoutePerLeg(
  coordinates: [number, number][],
  profile: string,
  avoidHighways: boolean,
  avoidFerries: boolean
): boolean {
  if (coordinates.length <= 2) return false;
  return profile !== 'fastest' || avoidHighways || avoidFerries;
}

/** Distance along the stitched polyline, for elevation and cue sheet alike. */
export function legDistances(polyline: [number, number][]): number[] {
  return cumulativeDistancesKm(polyline);
}
