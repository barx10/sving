import { describe, expect, it } from 'vitest';
import {
  type ElevationPoint,
  type OsrmRoute,
  elevationStats,
  pickBestRoute,
  pickSampleIndices,
} from './route';

/** Builds an OSRM-shaped candidate from a polyline given as [lat, lng] pairs. */
function candidate(
  line: [number, number][],
  distanceKm: number,
  highwaySteps: { name: string; km: number }[] = []
): OsrmRoute {
  return {
    distance: distanceKm * 1000,
    duration: distanceKm * 60,
    geometry: { coordinates: line.map(([lat, lng]) => [lng, lat] as [number, number]) },
    legs: [{ steps: highwaySteps.map((s) => ({ name: s.name, distance: s.km * 1000 })) }],
  };
}

const straightLine: [number, number][] = Array.from({ length: 40 }, (_, i) => [62 + i * 0.01, 7]);

const twistyLine: [number, number][] = Array.from({ length: 40 }, (_, i) => [
  62 + i * 0.002,
  7 + (i % 2) * 0.003,
]);

describe('pickBestRoute', () => {
  it('prefers the twisty road over a longer straight one', () => {
    // The original scoring used raw distance, which meant "curvy" really meant
    // "longest" — a long motorway detour beat a short mountain pass.
    const long = candidate(straightLine, 220);
    const twisty = candidate(twistyLine, 90);

    expect(pickBestRoute([long, twisty], 'curvy', true)).toBe(twisty);
  });

  it('penalises routes that spend distance on E-roads when avoiding motorways', () => {
    const viaMotorway = candidate(twistyLine, 100, [{ name: 'E6', km: 80 }]);
    const backRoads = candidate(twistyLine, 100, [{ name: 'Fylkesveg 63', km: 0 }]);

    expect(pickBestRoute([viaMotorway, backRoads], 'curvy', true)).toBe(backRoads);
  });

  it('takes OSRM’s first suggestion when the rider wants speed', () => {
    const fastest = candidate(straightLine, 200);
    const scenic = candidate(twistyLine, 90);

    expect(pickBestRoute([fastest, scenic], 'fastest', false)).toBe(fastest);
  });

  it('returns the only candidate when there are no alternatives', () => {
    const only = candidate(twistyLine, 90);
    expect(pickBestRoute([only], 'curvy', true)).toBe(only);
  });

  it('copes with candidates that carry no step data', () => {
    const withoutLegs: OsrmRoute = {
      distance: 90_000,
      duration: 5400,
      geometry: { coordinates: twistyLine.map(([lat, lng]) => [lng, lat] as [number, number]) },
    };
    expect(() => pickBestRoute([withoutLegs], 'curvy', true)).not.toThrow();
  });
});

describe('pickSampleIndices', () => {
  it('always includes both ends', () => {
    const indices = pickSampleIndices(1000, 75);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(999);
  });

  it('never exceeds the requested count', () => {
    expect(pickSampleIndices(1000, 75).length).toBeLessThanOrEqual(75);
  });

  it('returns strictly increasing, unique indices', () => {
    const indices = pickSampleIndices(1000, 75);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('returns every index when the line is shorter than the sample count', () => {
    expect(pickSampleIndices(5, 75)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('elevationStats', () => {
  const profile: ElevationPoint[] = [
    { distanceKm: 0, elevationM: 100, lat: 62, lng: 7 },
    { distanceKm: 10, elevationM: 400, lat: 62.1, lng: 7 },
    { distanceKm: 20, elevationM: 250, lat: 62.2, lng: 7 },
    { distanceKm: 30, elevationM: 600, lat: 62.3, lng: 7 },
  ];

  it('sums climbs and descents separately', () => {
    expect(elevationStats(profile)).toEqual({
      elevationGainM: 650, // 300 up + 350 up
      elevationLossM: 150,
      maxElevationM: 600,
    });
  });

  it('reports null rather than zero when there is no elevation data', () => {
    // Zero would render as a perfectly flat "+0 m" profile, which reads as a
    // measurement. Null lets the UI say the data is simply unavailable.
    expect(elevationStats(null)).toEqual({
      elevationGainM: null,
      elevationLossM: null,
      maxElevationM: null,
    });
    expect(elevationStats([])).toEqual({
      elevationGainM: null,
      elevationLossM: null,
      maxElevationM: null,
    });
  });

  it('handles a single sampled point', () => {
    expect(elevationStats([profile[0]])).toEqual({
      elevationGainM: 0,
      elevationLossM: 0,
      maxElevationM: 100,
    });
  });
});
