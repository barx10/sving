import type { PointOfInterest } from '../types';
import { cumulativeDistancesKm, haversineDistance } from './geo';

/**
 * Turning a route into something the Overpass corridor search can use, and
 * turning what comes back into an ordered list.
 *
 * A route polyline is thousands of points; Overpass wants a handful. It reads a
 * coordinate list in `around` as a polyline and searches the corridor along it,
 * so sampling every few kilometres still covers the road in between — the gaps
 * are interpolated, not skipped.
 */

/**
 * Roughly how far apart the sampled points sit along the route.
 *
 * Overpass charges for every point in an `around` list, and the corridor search
 * was running right at the edge of its own 25-second budget: a 124 km route
 * sampled 26 points and took 19.4 seconds on overpass-api.de, so any load at
 * all tipped it into a 504 and the rider got "Fant ikke bensinstasjoner".
 *
 * Measured on that same route, against the same instance:
 *
 *   26 points  19.4 s  94 finds
 *   14 points  10.6 s  91 finds
 *    8 points   7.9 s  64 finds
 *
 * Ten kilometres is where that curve turns: a little over half the cost for all
 * but a handful of the results. Going coarser starts dropping real stations,
 * because Overpass follows the straight chord between samples and a chord that
 * long leaves the road on anything twisty.
 */
export const SAMPLE_SPACING_KM = 10;

/**
 * Hard cap, well under what the server accepts. A long route samples coarser
 * rather than sending a query that times out and returns nothing at all — a
 * rough answer about fuel beats an error message about it.
 */
export const MAX_SAMPLE_POINTS = 30;

/**
 * Samples the route at a fixed spacing, always keeping the first and last
 * point so the corridor reaches the whole way from start to finish.
 */
export function sampleRouteForPois(polyline: [number, number][]): [number, number][] {
  if (polyline.length <= 2) return [...polyline];

  const distances = cumulativeDistancesKm(polyline);
  const totalKm = distances[distances.length - 1];
  if (totalKm <= 0) return [polyline[0], polyline[polyline.length - 1]];

  // Stretch the spacing on long routes rather than truncating the corridor
  // halfway, which would silently drop every station after the cap.
  const spacingKm = Math.max(SAMPLE_SPACING_KM, totalKm / (MAX_SAMPLE_POINTS - 1));

  const sampled: [number, number][] = [polyline[0]];
  let nextKm = spacingKm;

  for (let i = 1; i < polyline.length - 1; i++) {
    if (distances[i] >= nextKm) {
      sampled.push(polyline[i]);
      nextKm = distances[i] + spacingKm;
    }
  }

  sampled.push(polyline[polyline.length - 1]);
  return sampled;
}

/**
 * Places each point of interest along the route and sorts by that distance.
 * OSM hands them back in database order, which is no order at all to a rider —
 * what they want to know is which station comes next.
 */
export function orderAlongRoute(
  pois: PointOfInterest[],
  polyline: [number, number][]
): PointOfInterest[] {
  if (polyline.length === 0) return [...pois];

  const distances = cumulativeDistancesKm(polyline);

  // Walking every polyline point for every result is wasted work on a long
  // route; a coarse pass is accurate to well under the corridor width.
  const step = Math.max(1, Math.floor(polyline.length / 600));

  return pois
    .map((poi) => {
      let nearestKm = Infinity;
      let alongKm = 0;

      for (let i = 0; i < polyline.length; i += step) {
        const gap = haversineDistance(poi.lat, poi.lng, polyline[i][0], polyline[i][1]);
        if (gap < nearestKm) {
          nearestKm = gap;
          alongKm = distances[i];
        }
      }

      return {
        ...poi,
        distanceAlongKm: Math.round(alongKm),
        detourKm: Math.round(nearestKm * 10) / 10,
      };
    })
    .sort((a, b) => (a.distanceAlongKm ?? 0) - (b.distanceAlongKm ?? 0));
}
