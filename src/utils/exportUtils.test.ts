import { describe, expect, it } from 'vitest';
import type { Waypoint } from '../types';
import { buildAppleMapsUrl, buildGoogleMapsUrl, reduceWaypointsForMaps } from './exportUtils';

/** A winding line with enough points to exercise the reduction logic. */
const polyline: [number, number][] = Array.from({ length: 200 }, (_, i) => [
  62 + i * 0.004,
  7 + Math.sin(i / 6) * 0.05,
]);

const waypoints: Waypoint[] = [
  { id: 'a', name: 'Start', lat: 62, lng: 7 },
  { id: 'b', name: 'Mål', lat: 62.796, lng: 7 },
];

describe('reduceWaypointsForMaps', () => {
  it('keeps the real start and end of the route', () => {
    const points = reduceWaypointsForMaps(polyline, waypoints, 7);
    expect(points[0]).toEqual(polyline[0]);
    expect(points[points.length - 1]).toEqual(polyline[polyline.length - 1]);
  });

  it('never emits the same point twice', () => {
    // The old version pushed the first and last points unconditionally and then
    // appended a selection that could contain those same indices again, so a
    // route could arrive at Google Maps with a duplicated origin.
    const points = reduceWaypointsForMaps(polyline, waypoints, 7);
    const keys = points.map((p) => p.join(','));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('stays within the budget the navigation app allows', () => {
    const points = reduceWaypointsForMaps(polyline, waypoints, 7);
    expect(points.length).toBeLessThanOrEqual(9); // origin + destination + 7
  });

  it('returns points in route order', () => {
    const points = reduceWaypointsForMaps(polyline, waypoints, 7);
    const latitudes = points.map((p) => p[0]);
    expect([...latitudes].sort((a, b) => a - b)).toEqual(latitudes);
  });

  it('passes a short route through untouched', () => {
    const short: [number, number][] = [
      [62, 7],
      [62.1, 7.1],
      [62.2, 7.2],
    ];
    expect(reduceWaypointsForMaps(short, waypoints, 7)).toEqual(short);
  });

  it('ignores unplaced waypoints when there is no route yet', () => {
    const mixed: Waypoint[] = [
      { id: 'a', name: 'Start', lat: 62, lng: 7 },
      { id: 'b', name: '', lat: 0, lng: 0 },
    ];
    expect(reduceWaypointsForMaps([], mixed, 7)).toEqual([[62, 7]]);
  });
});

describe('map deep links', () => {
  it('builds a Google Maps URL with origin, destination and via points', () => {
    const url = new URL(buildGoogleMapsUrl(polyline, waypoints));
    expect(url.searchParams.get('origin')).toBe('62.00000,7.00000');
    expect(url.searchParams.get('travelmode')).toBe('driving');
    expect(url.searchParams.get('waypoints')).toContain('|');
  });

  it('builds an Apple Maps URL with driving directions', () => {
    const url = new URL(buildAppleMapsUrl(polyline, waypoints));
    expect(url.searchParams.get('saddr')).toBe('62.00000,7.00000');
    expect(url.searchParams.get('dirflg')).toBe('d');
  });

  it('falls back to the plain map when there is no route', () => {
    expect(buildGoogleMapsUrl([], [])).toBe('https://www.google.com/maps');
    expect(buildAppleMapsUrl([], [])).toBe('https://maps.apple.com');
  });
});
