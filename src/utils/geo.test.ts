import { describe, expect, it } from 'vitest';
import {
  cumulativeDistancesKm,
  curvatureDegPerKm,
  hasCoords,
  haversineDistance,
  isValidCoord,
  polylineLengthKm,
  sinuosity,
} from './geo';

describe('haversineDistance', () => {
  it('measures a known distance', () => {
    // Oslo to Bergen is about 305 km as the crow flies.
    const km = haversineDistance(59.9139, 10.7522, 60.3913, 5.3221);
    expect(km).toBeGreaterThan(295);
    expect(km).toBeLessThan(315);
  });

  it('is zero for a point against itself', () => {
    expect(haversineDistance(62.5, 7.6, 62.5, 7.6)).toBe(0);
  });

  it('is symmetric', () => {
    const there = haversineDistance(62.5, 7.6, 60.1, 5.3);
    const back = haversineDistance(60.1, 5.3, 62.5, 7.6);
    expect(there).toBeCloseTo(back, 9);
  });
});

describe('cumulativeDistancesKm', () => {
  it('starts at zero and ends at the total length', () => {
    const line: [number, number][] = [
      [62.5, 7.6],
      [62.4, 7.5],
      [62.3, 7.4],
    ];
    const distances = cumulativeDistancesKm(line);

    expect(distances).toHaveLength(3);
    expect(distances[0]).toBe(0);
    expect(distances[2]).toBeCloseTo(polylineLengthKm(line), 9);
  });

  it('never decreases', () => {
    const line: [number, number][] = [
      [62.5, 7.6],
      [62.1, 7.2],
      [61.8, 8.0],
      [61.4, 8.8],
    ];
    const distances = cumulativeDistancesKm(line);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  it('handles a single-point line', () => {
    expect(cumulativeDistancesKm([[62.5, 7.6]])).toEqual([0]);
  });
});

describe('hasCoords', () => {
  it('treats the (0, 0) placeholder as unplaced', () => {
    // Empty rows in the route editor carry (0, 0). It is a real coordinate in
    // the Gulf of Guinea, but never a Norwegian waypoint.
    expect(hasCoords({ lat: 0, lng: 0 })).toBe(false);
  });

  it('accepts a real waypoint', () => {
    expect(hasCoords({ lat: 62.5674, lng: 7.6872 })).toBe(true);
  });

  it('accepts a coordinate with one zero component', () => {
    expect(hasCoords({ lat: 62.5674, lng: 0 })).toBe(true);
  });

  it('rejects NaN', () => {
    expect(hasCoords({ lat: NaN, lng: 7.6 })).toBe(false);
  });
});

describe('isValidCoord', () => {
  it('accepts coordinates in range', () => {
    expect(isValidCoord(62.5, 7.6)).toBe(true);
  });

  it('rejects coordinates out of range', () => {
    expect(isValidCoord(91, 7.6)).toBe(false);
    expect(isValidCoord(62.5, 181)).toBe(false);
    expect(isValidCoord(NaN, 7.6)).toBe(false);
  });
});

describe('sinuosity', () => {
  it('is 1 for a straight line', () => {
    const straight: [number, number][] = [
      [62.0, 7.0],
      [62.1, 7.0],
      [62.2, 7.0],
    ];
    expect(sinuosity(straight)).toBeCloseTo(1, 3);
  });

  it('exceeds 1 for a road that doubles back', () => {
    const twisty: [number, number][] = [
      [62.0, 7.0],
      [62.1, 7.1],
      [62.0, 7.2],
      [62.1, 7.3],
    ];
    expect(sinuosity(twisty)).toBeGreaterThan(1.2);
  });
});

describe('curvatureDegPerKm', () => {
  it('is near zero for a straight road', () => {
    const straight: [number, number][] = [
      [62.0, 7.0],
      [62.1, 7.0],
      [62.2, 7.0],
      [62.3, 7.0],
    ];
    expect(curvatureDegPerKm(straight)).toBeLessThan(1);
  });

  it('ranks hairpins above a long straight detour', () => {
    // The old "curvy" scoring used raw distance, so a long straight road beat a
    // short pass full of hairpins. Curvature has to get this the right way round.
    const hairpins: [number, number][] = [];
    for (let i = 0; i < 20; i++) {
      hairpins.push([62 + i * 0.002, 7 + (i % 2) * 0.004]);
    }

    const longStraight: [number, number][] = [
      [62.0, 7.0],
      [62.5, 7.0],
      [63.0, 7.0],
    ];

    expect(curvatureDegPerKm(hairpins)).toBeGreaterThan(curvatureDegPerKm(longStraight));
  });

  it('returns zero rather than NaN for degenerate input', () => {
    expect(curvatureDegPerKm([])).toBe(0);
    expect(curvatureDegPerKm([[62, 7]])).toBe(0);
  });
});
