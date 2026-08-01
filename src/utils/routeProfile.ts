import type { RouteProfile } from '../types';
import { haversineDistance } from './geo';

/**
 * What a riding style actually decides, in one place both sides import.
 *
 * There used to be three styles. "Naturskjønn" and "Svingete veier" ran through
 * exactly the same code — same routing preference, same avoided features, same
 * curvature ranking — and differed only by a four percent nudge to the estimated
 * time, which the OpenRouteService path never applied. Two names for one
 * behaviour is a promise the app could not keep, so there are two styles now.
 */

/**
 * Older shared links and saved tours still carry 'scenic'. They keep working and
 * land on 'curvy', which is where they always effectively pointed.
 */
export function normalizeProfile(value: unknown): RouteProfile {
  return value === 'fastest' ? 'fastest' : 'curvy';
}

/**
 * ORS's public API caps alternative_routes at 100 km of road distance — asking
 * above that returns a 400. Straight-line distance is the only thing known
 * before routing, so the threshold stays well under 100 km to leave room for
 * how much longer a curvy mountain road runs compared to the straight line
 * between its endpoints.
 */
export const ALTERNATIVES_MAX_STRAIGHT_LINE_KM = 60;

/**
 * Whether asking for a curvier route can change the road at all.
 *
 * Both routing engines only offer alternatives for a plain A-to-B request, and
 * ORS caps that by distance on top. Outside this window exactly one route comes
 * back, the curvature ranking has nothing to choose between, and the riding
 * style decides only whether motorways are avoided. The planner says so instead
 * of implying the route was shaped around the rider.
 */
export function curvatureRankingApplies(points: { lat: number; lng: number }[]): boolean {
  if (points.length !== 2) return false;

  return (
    haversineDistance(points[0].lat, points[0].lng, points[1].lat, points[1].lng) <=
    ALTERNATIVES_MAX_STRAIGHT_LINE_KM
  );
}
