import type { RouteProfile, Waypoint } from '../types';
import { hasCoords } from './geo';

/**
 * Everything a route request actually depends on, in one comparable string.
 * The app recalculates whenever this changes, so it has to cover the choices
 * that alter the road — and nothing else. A waypoint's name arrives late from
 * reverse geocoding and its id changes on every rebuild, so neither belongs
 * here: including them would send a second request for the same route.
 */
export function routeSignatureOf(
  waypoints: Waypoint[],
  profile: RouteProfile,
  avoidHighways: boolean
): string {
  return [
    waypoints
      .filter(hasCoords)
      // Five decimals is roughly a metre — finer than any click can aim, and
      // enough that floating-point noise never counts as a new route.
      .map((wp) => `${wp.lat.toFixed(5)},${wp.lng.toFixed(5)}`)
      .join(';'),
    profile,
    avoidHighways ? 'noHighway' : 'highway',
  ].join('|');
}
