import { describe, expect, it } from 'vitest';
import { MAX_SAMPLE_POINTS, orderAlongRoute, sampleRouteForPois } from './pois';
import { polylineLengthKm } from './geo';
import type { PointOfInterest } from '../types';

/** A straight line north from Åndalsnes, one point every ~1.1 km. */
function straightRoute(points: number): [number, number][] {
  return Array.from({ length: points }, (_, i) => [62.5 + i * 0.01, 7.7] as [number, number]);
}

const poi = (id: string, lat: number, lng: number): PointOfInterest => ({
  id,
  category: 'fuel',
  name: id,
  lat,
  lng,
});

describe('sampleRouteForPois', () => {
  it('keeps a two-point route as it is', () => {
    const line = straightRoute(2);
    expect(sampleRouteForPois(line)).toEqual(line);
  });

  it('keeps the first and last point so the corridor covers the whole route', () => {
    const line = straightRoute(400);
    const sampled = sampleRouteForPois(line);

    expect(sampled[0]).toEqual(line[0]);
    expect(sampled[sampled.length - 1]).toEqual(line[line.length - 1]);
  });

  it('thins a long route down instead of walking every point', () => {
    const line = straightRoute(400);
    const sampled = sampleRouteForPois(line);

    expect(sampled.length).toBeLessThan(line.length / 3);
    expect(sampled.length).toBeGreaterThan(2);
  });

  it('never exceeds the cap the server enforces, however long the route', () => {
    // Roughly 2200 km — longer than any single day on a motorcycle in Norway.
    const sampled = sampleRouteForPois(straightRoute(2000));
    expect(sampled.length).toBeLessThanOrEqual(MAX_SAMPLE_POINTS);
  });

  it('stretches the spacing on a long route rather than cutting it short', () => {
    const line = straightRoute(2000);
    const sampled = sampleRouteForPois(line);

    // The corridor still spans the full route, which is what truncating at the
    // cap would have broken: every station past the cut would vanish.
    expect(polylineLengthKm(sampled)).toBeCloseTo(polylineLengthKm(line), 0);
  });

  it('survives a degenerate route where every point is the same', () => {
    const line: [number, number][] = Array.from({ length: 10 }, () => [62.5, 7.7]);
    expect(sampleRouteForPois(line)).toEqual([line[0], line[line.length - 1]]);
  });
});

describe('orderAlongRoute', () => {
  const line = straightRoute(100);

  it('sorts by how far along the route each place sits', () => {
    const ordered = orderAlongRoute(
      [poi('late', 63.4, 7.7), poi('early', 62.55, 7.7), poi('middle', 63.0, 7.7)],
      line
    );

    expect(ordered.map((p) => p.id)).toEqual(['early', 'middle', 'late']);
  });

  it('reports the distance along the route in kilometres', () => {
    const [first] = orderAlongRoute([poi('start', 62.5, 7.7)], line);
    expect(first.distanceAlongKm).toBe(0);
  });

  it('reports how far off the road a place sits', () => {
    // Same latitude as the start, but shifted east — a genuine detour.
    const [beside] = orderAlongRoute([poi('beside', 62.5, 7.75)], line);

    expect(beside.detourKm).toBeGreaterThan(1);
    expect(beside.detourKm).toBeLessThan(4);
  });

  it('leaves the list alone when there is no route to measure against', () => {
    const pois = [poi('a', 62.5, 7.7)];
    expect(orderAlongRoute(pois, [])).toEqual(pois);
  });
});
