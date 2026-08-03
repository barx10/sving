import { describe, expect, it } from 'vitest';
import {
  condense,
  ferryKm,
  readOrsDirections,
  readOsrmDirections,
  type OrsSegment,
  type OsrmLeg,
} from './directions.js';
import type { RouteStep } from '../../src/types.js';

const polyline: [number, number][] = [
  [62.5674, 7.6869],
  [62.55, 7.65],
  [62.5, 7.6],
  [62.45, 7.55],
];

describe('stepsFromOrs', () => {
  it('writes Norwegian for the manoeuvre codes ORS reports', () => {
    const segments: OrsSegment[] = [
      {
        steps: [
          { type: 11, name: 'Romsdalsvegen', distance: 1200, way_points: [0, 1] },
          { type: 1, name: 'Fylkesveg 63', distance: 8000, way_points: [1, 2] },
          { type: 2, name: 'Trollstigvegen', distance: 4000, way_points: [2, 3] },
          { type: 10, name: '', distance: 0, way_points: [3, 3] },
        ],
      },
    ];

    expect(readOrsDirections(segments, polyline, []).steps.map((s) => s.instruction)).toEqual([
      'Start',
      'Ta til høyre',
      'Skarp sving til venstre',
      'Framme',
    ]);
  });

  /** The number a rider reads has to be the distance *to* the turn. */
  it('measures each cue from the start of the route, not from the step before', () => {
    const segments: OrsSegment[] = [
      {
        steps: [
          { type: 11, name: 'A', distance: 1200, way_points: [0, 1] },
          { type: 1, name: 'B', distance: 8000, way_points: [1, 2] },
          { type: 0, name: 'C', distance: 400, way_points: [2, 3] },
        ],
      },
    ];

    expect(readOrsDirections(segments, polyline, []).steps.map((s) => s.distanceKm)).toEqual([0, 1.2, 9.2]);
  });

  it('places each cue where the manoeuvre is, so the map can follow later', () => {
    const segments: OrsSegment[] = [
      { steps: [{ type: 11, name: 'A', distance: 100, way_points: [0, 1] }] },
    ];

    expect(readOrsDirections(segments, polyline, []).steps[0]).toMatchObject({ lat: 62.5674, lng: 7.6869 });
  });

  it('survives an index that points past the end of the geometry', () => {
    const segments: OrsSegment[] = [
      { steps: [{ type: 1, name: 'A', distance: 100, way_points: [99] }] },
    ];

    expect(() => readOrsDirections(segments, polyline, []).steps).not.toThrow();
  });

  it('drops an unnamed road rather than printing an empty line', () => {
    const segments: OrsSegment[] = [
      { steps: [{ type: 1, name: '  ', distance: 100, way_points: [0] }] },
    ];

    expect(readOrsDirections(segments, polyline, []).steps[0].roadName).toBeNull();
  });

  it('returns nothing at all when the engine sent no instructions', () => {
    expect(readOrsDirections([], polyline, []).steps).toEqual([]);
  });
});

describe('stepsFromOsrm', () => {
  /**
   * OSRM splits the meaning across two fields, and which one carries it depends
   * on the type: a "turn" says everything in its modifier, an "on ramp" says it
   * in the type and uses the modifier only for which side.
   */
  it('reads the modifier for a turn and the type for everything else', () => {
    const legs: OsrmLeg[] = [
      {
        steps: [
          { distance: 500, name: 'Start', maneuver: { type: 'depart', location: [7.68, 62.56] } },
          { distance: 900, name: 'Fv63', maneuver: { type: 'turn', modifier: 'sharp right', location: [7.65, 62.55] } },
          { distance: 300, name: 'E136', maneuver: { type: 'on ramp', modifier: 'right', location: [7.6, 62.5] } },
          { distance: 0, name: '', maneuver: { type: 'arrive', location: [7.55, 62.45] } },
        ],
      },
    ];

    expect(readOsrmDirections(legs).steps.map((s) => s.instruction)).toEqual([
      'Start',
      'Skarp sving til høyre',
      'Ta påkjøringsrampen',
      'Framme',
    ]);
  });

  it('takes the position from the manoeuvre, in lat/lng order', () => {
    const legs: OsrmLeg[] = [
      { steps: [{ distance: 10, name: 'A', maneuver: { type: 'depart', location: [7.6869, 62.5674] } }] },
    ];

    expect(readOsrmDirections(legs).steps[0]).toMatchObject({ lat: 62.5674, lng: 7.6869 });
  });

  it('falls back to carrying straight on for a manoeuvre it does not know', () => {
    const legs: OsrmLeg[] = [
      { steps: [{ distance: 10, name: 'A', maneuver: { type: 'notification' } }] },
    ];

    expect(readOsrmDirections(legs).steps[0].instruction).toBe('Fortsett rett fram');
  });

  it('copes with a leg carrying no steps', () => {
    expect(readOsrmDirections([{}]).steps).toEqual([]);
  });
});

const step = (
  instruction: string,
  roadName: string | null,
  distanceKm = 0,
  isFerry = false
): RouteStep => ({
  distanceKm,
  instruction,
  roadName,
  isFerry,
  lat: 62,
  lng: 7,
});

describe('condense', () => {
  /**
   * Engines emit a step every time a road changes name or class, so a mountain
   * route arrives with hundreds of "carry straight on" entries between the
   * handful of turns that decide where you end up.
   */
  it('drops carry-on cues that keep you on the road you are already on', () => {
    const kept = condense([
      step('Start', 'Romsdalsvegen'),
      step('Fortsett rett fram', 'Romsdalsvegen', 2),
      step('Fortsett rett fram', 'Romsdalsvegen', 5),
      step('Ta til høyre', 'Fv63', 9),
      step('Framme', null, 12),
    ]);

    expect(kept.map((s) => s.instruction)).toEqual(['Start', 'Ta til høyre', 'Framme']);
  });

  it('keeps a carry-on cue that puts you on a differently named road', () => {
    const kept = condense([
      step('Start', 'Romsdalsvegen'),
      step('Fortsett rett fram', 'Fv63', 4),
      step('Framme', null, 9),
    ]);

    expect(kept).toHaveLength(3);
  });

  it('never drops the start or the arrival', () => {
    const kept = condense([
      step('Fortsett rett fram', 'A'),
      step('Fortsett rett fram', 'A', 3),
      step('Fortsett rett fram', 'A', 6),
    ]);

    expect(kept).toHaveLength(2);
  });

  it('leaves a short list alone', () => {
    const two = [step('Start', 'A'), step('Framme', null, 5)];
    expect(condense(two)).toEqual(two);
  });

  it('keeps a long route down to something a rider can read at a pump', () => {
    const many = [
      step('Start', 'A'),
      ...Array.from({ length: 600 }, (_, i) => step('Ta til høyre', `Veg ${i}`, i)),
      step('Framme', null, 601),
    ];

    expect(condense(many).length).toBeLessThanOrEqual(250);
  });
});

/**
 * Ferries decide two things a rider cannot plan without: what to catch, and how
 * long the trip honestly takes. The engines answer with very different
 * confidence, and the difference between "none" and "cannot tell" matters more
 * than either on a Vestlandet route.
 */
describe('ferries', () => {
  const ferryLegs: OsrmLeg[] = [
    {
      steps: [
        { distance: 8000, duration: 600, name: 'Fv64', mode: 'driving', maneuver: { type: 'depart' } },
        {
          distance: 3200,
          duration: 900,
          name: 'Sølsnes - Åfarnes',
          mode: 'ferry',
          maneuver: { type: 'continue' },
        },
        { distance: 5000, duration: 400, name: 'Fv64', mode: 'driving', maneuver: { type: 'arrive' } },
      ],
    },
  ];

  it('reads a crossing off OSRM, which marks the travel mode outright', () => {
    const { ferries, ferrySeconds, ferryStatus } = readOsrmDirections(ferryLegs);

    expect(ferryStatus).toBe('known');
    expect(ferrySeconds).toBe(900);
    expect(ferries).toEqual([{ name: 'Sølsnes - Åfarnes', distanceKm: 8, crossingMin: 15 }]);
  });

  it('says "ta ferga" rather than describing the corner onto the quay', () => {
    expect(readOsrmDirections(ferryLegs).steps[1]).toMatchObject({
      instruction: 'Ta ferga',
      isFerry: true,
    });
  });

  it('reads a crossing off ORS when the waytype annotation resolves it', () => {
    const segments: OrsSegment[] = [
      { steps: [
        { type: 11, name: 'Fv64', distance: 8000, duration: 600, way_points: [0, 1] },
        { type: 6, name: 'Sølsnes - Åfarnes', distance: 3200, duration: 900, way_points: [1, 2] },
      ] },
    ];

    const { ferries, ferryStatus } = readOrsDirections(segments, polyline, [[1, 2, 9]]);
    expect(ferryStatus).toBe('known');
    expect(ferries[0]).toMatchObject({ name: 'Sølsnes - Åfarnes', crossingMin: 15 });
  });

  /**
   * ORS has a long-standing bug where ferry sections come back as waytype 0
   * rather than 9, and the annotation has to be asked for at all. An empty list
   * from an engine that was never going to tell us is not "no ferries".
   */
  it('reports not knowing, rather than reporting none', () => {
    const segments: OrsSegment[] = [
      { steps: [{ type: 11, name: 'Fv64', distance: 8000, way_points: [0, 1] }] },
    ];

    expect(readOrsDirections(segments, polyline, undefined).ferryStatus).toBe('unknown');
    expect(readOrsDirections(segments, polyline, []).ferryStatus).toBe('known');
  });

  it('keeps every crossing on the cue sheet, however long the route', () => {
    const many = [
      step('Start', 'A'),
      ...Array.from({ length: 400 }, (_, i) => step('Fortsett rett fram', 'A', i)),
      step('Ta ferga', 'Sølsnes - Åfarnes', 401, true),
      ...Array.from({ length: 400 }, (_, i) => step('Ta til høyre', `Veg ${i}`, 402 + i)),
      step('Framme', null, 900),
    ];

    expect(condense(many).some((s) => s.isFerry)).toBe(true);
  });

  it('counts ferry kilometres for the routes that try to avoid them', () => {
    expect(ferryKm(ferryLegs)).toBeCloseTo(3.2, 5);
    expect(ferryKm([{ steps: [{ distance: 1000, mode: 'driving' }] }])).toBe(0);
  });
});
