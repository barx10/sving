import type { RouteProfile, Waypoint } from '../types';
import { hasCoords, isValidCoord } from './geo';

/**
 * Encodes a planned route into the URL hash so riders can share it in a group
 * chat. The hash never reaches the server, so shared routes stay private to
 * whoever holds the link — no accounts, no storage, nothing to take down.
 */

const HASH_KEY = 'tur';
const SCHEMA_VERSION = 1;
/** Five decimals is a little over one metre — far finer than any route needs. */
const COORD_PRECISION = 5;

interface EncodedRoute {
  v: number;
  p: RouteProfile;
  a: 0 | 1;
  /** [lat, lng, name] per waypoint. */
  w: [number, number, string][];
}

export interface SharedRoute {
  waypoints: Waypoint[];
  profile: RouteProfile;
  avoidHighways: boolean;
}

const round = (n: number): number => Number(n.toFixed(COORD_PRECISION));

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let base64: string;

  if (typeof btoa === 'function') {
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    base64 = btoa(binary);
  } else {
    base64 = Buffer.from(bytes).toString('base64');
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(padded, 'base64').toString('utf8');
}

/** Returns the hash fragment (including `#`) for a route, or '' if nothing is placed. */
export function encodeRouteToHash(
  waypoints: Waypoint[],
  profile: RouteProfile,
  avoidHighways: boolean
): string {
  const placed = waypoints.filter(hasCoords);
  if (placed.length < 2) return '';

  const payload: EncodedRoute = {
    v: SCHEMA_VERSION,
    p: profile,
    a: avoidHighways ? 1 : 0,
    w: placed.map((wp) => [round(wp.lat), round(wp.lng), wp.name ?? '']),
  };

  return `#${HASH_KEY}=${toBase64Url(JSON.stringify(payload))}`;
}

/** Full shareable URL for the current route, or '' if there is nothing to share. */
export function buildShareUrl(
  waypoints: Waypoint[],
  profile: RouteProfile,
  avoidHighways: boolean,
  baseUrl?: string
): string {
  const hash = encodeRouteToHash(waypoints, profile, avoidHighways);
  if (!hash) return '';

  const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
  return `${base.split('#')[0]}${hash}`;
}

const VALID_PROFILES: RouteProfile[] = ['curvy', 'scenic', 'fastest'];

/**
 * Reads a route back out of a URL hash. Returns null for anything malformed —
 * a bad link should drop the rider on an empty planner, never crash the app.
 */
export function decodeRouteFromHash(hash: string): SharedRoute | null {
  if (!hash) return null;

  const match = hash.replace(/^#/, '').match(new RegExp(`(?:^|&)${HASH_KEY}=([^&]+)`));
  if (!match) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(match[1])) as EncodedRoute;
    if (!parsed || parsed.v !== SCHEMA_VERSION || !Array.isArray(parsed.w)) return null;

    const waypoints: Waypoint[] = [];
    parsed.w.forEach((entry, idx) => {
      if (!Array.isArray(entry) || entry.length < 2) return;
      const [lat, lng, name] = entry;
      if (typeof lat !== 'number' || typeof lng !== 'number' || !isValidCoord(lat, lng)) return;

      waypoints.push({
        id: `shared_wp_${idx}`,
        name: typeof name === 'string' && name ? name : `Punkt ${idx + 1}`,
        lat,
        lng,
      });
    });

    if (waypoints.length < 2) return null;

    return {
      waypoints,
      profile: VALID_PROFILES.includes(parsed.p) ? parsed.p : 'curvy',
      avoidHighways: parsed.a !== 0,
    };
  } catch {
    return null;
  }
}
