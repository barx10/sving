import { describe, expect, it } from 'vitest';
import { legPairs, shouldRoutePerLeg, stitchLegs, type RouteLeg } from './legs.js';
import type { RouteStep } from '../../src/types.js';

const step = (distanceKm: number, instruction: string, roadName: string | null = null): RouteStep => ({
  distanceKm,
  instruction,
  roadName,
  isFerry: false,
  lat: 62,
  lng: 7,
});

function leg(overrides: Partial<RouteLeg> = {}): RouteLeg {
  return {
    polyline: [
      [62.0, 7.0],
      [62.1, 7.1],
      [62.2, 7.2],
    ],
    distanceM: 10_000,
    durationS: 600,
    steps: [step(0, 'Start', 'A'), step(4, 'Ta til høyre', 'B'), step(10, 'Framme')],
    ferries: [],
    ferrySeconds: 0,
    ferryStatus: 'known',
    elevations: [100, 200, 300],
    ...overrides,
  };
}

describe('stitchLegs', () => {
  it('hands a single leg back untouched', () => {
    const only = leg();
    expect(stitchLegs([only])).toBe(only);
  });

  it('survives being handed nothing', () => {
    expect(stitchLegs([]).polyline).toEqual([]);
  });

  /** Each leg starts where the last ended; kept twice, the profile gets a
   *  zero-length step at every via point and the distance is right by luck. */
  it('joins on the shared point rather than repeating it', () => {
    const joined = stitchLegs([leg(), leg({ polyline: [[62.2, 7.2], [62.3, 7.3]] })]);

    expect(joined.polyline).toEqual([
      [62.0, 7.0],
      [62.1, 7.1],
      [62.2, 7.2],
      [62.3, 7.3],
    ]);
  });

  it('adds up the distance and the time', () => {
    const joined = stitchLegs([leg(), leg({ distanceM: 5000, durationS: 300 })]);

    expect(joined.distanceM).toBe(15_000);
    expect(joined.durationS).toBe(900);
  });

  /**
   * A cue sheet measured from each leg's own start would restart at zero at
   * every via point, which is worse than useless at a junction.
   */
  it('measures every cue from the start of the whole route', () => {
    const second = leg({ steps: [step(0, 'Start', 'B'), step(3, 'Ta til venstre', 'C'), step(8, 'Framme')] });
    const joined = stitchLegs([leg(), second]);

    expect(joined.steps.map((s) => s.distanceKm)).toEqual([0, 4, 13, 18]);
  });

  /** Otherwise a three-leg route announces that you have arrived twice first. */
  it('drops the arrival and departure that only mark a via point', () => {
    const joined = stitchLegs([leg(), leg(), leg()]);

    expect(joined.steps.filter((s) => s.instruction === 'Framme')).toHaveLength(1);
    expect(joined.steps.filter((s) => s.instruction === 'Start')).toHaveLength(1);
    expect(joined.steps[0].instruction).toBe('Start');
    expect(joined.steps[joined.steps.length - 1].instruction).toBe('Framme');
  });

  it('keeps a ferry, and moves it to where it sits in the whole route', () => {
    const second = leg({
      ferries: [{ name: 'Sølsnes - Åfarnes', distanceKm: 2, crossingMin: 15 }],
      ferrySeconds: 900,
    });
    const joined = stitchLegs([leg(), second]);

    expect(joined.ferries).toEqual([{ name: 'Sølsnes - Åfarnes', distanceKm: 12, crossingMin: 15 }]);
    expect(joined.ferrySeconds).toBe(900);
  });

  /** One leg we were not told about leaves the whole route uncertain. */
  it('reports the route as unknown if any single leg was', () => {
    expect(stitchLegs([leg(), leg({ ferryStatus: 'unknown' })]).ferryStatus).toBe('unknown');
    expect(stitchLegs([leg(), leg()]).ferryStatus).toBe('known');
  });

  it('joins elevation the same way as the line it belongs to', () => {
    const joined = stitchLegs([leg(), leg({ polyline: [[62.2, 7.2], [62.3, 7.3]], elevations: [300, 400] })]);

    expect(joined.elevations).toEqual([100, 200, 300, 400]);
    expect(joined.elevations).toHaveLength(joined.polyline.length);
  });

  it('drops elevation entirely when one leg came without it', () => {
    expect(stitchLegs([leg(), leg({ elevations: null })]).elevations).toBeNull();
  });
});

describe('legPairs', () => {
  it('makes one pair per hop', () => {
    expect(legPairs([[10, 59], [11, 60], [12, 61]])).toEqual([
      [[10, 59], [11, 60]],
      [[11, 60], [12, 61]],
    ]);
  });

  it('makes a single pair out of a plain A-to-B', () => {
    expect(legPairs([[10, 59], [11, 60]])).toHaveLength(1);
  });
});

describe('shouldRoutePerLeg', () => {
  const two: [number, number][] = [[10, 59], [11, 60]];
  const three: [number, number][] = [[10, 59], [11, 60], [12, 61]];

  /** With two points the ordinary request already asks for alternatives. */
  it('leaves a plain A-to-B alone', () => {
    expect(shouldRoutePerLeg(two, 'curvy', true, false)).toBe(false);
  });

  it('splits a route with a via point, which otherwise gets no choice at all', () => {
    expect(shouldRoutePerLeg(three, 'curvy', true, false)).toBe(true);
  });

  /** Nothing to rank means N requests buying the engine's first answer. */
  it('does not spend extra requests when there is no preference to express', () => {
    expect(shouldRoutePerLeg(three, 'fastest', false, false)).toBe(false);
  });

  it('splits for a rider avoiding something, even on the fastest style', () => {
    expect(shouldRoutePerLeg(three, 'fastest', true, false)).toBe(true);
    expect(shouldRoutePerLeg(three, 'fastest', false, true)).toBe(true);
  });
});
