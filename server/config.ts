/**
 * Runtime configuration. Everything that differs between a laptop and a
 * deployed instance is read from the environment, with defaults that keep
 * `bun dev` working out of the box.
 */

export const PORT = Number(process.env.PORT) || 3000;
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Both MET.no and Nominatim require a User-Agent that identifies the
 * application and gives them a way to reach the operator. Running a public
 * instance without a real contact address is a good way to get the IP blocked.
 */
const CONTACT = process.env.CONTACT_EMAIL || '';
const APP_URL = process.env.APP_URL || 'https://github.com/barx10/sving';

export const USER_AGENT = CONTACT
  ? `Sving/1.0 (${APP_URL}; ${CONTACT})`
  : `Sving/1.0 (${APP_URL})`;

export const OPENROUTESERVICE_API_KEY = process.env.OPENROUTESERVICE_API_KEY || '';

/**
 * Overpass instances used to find fuel and rest areas along a route, tried in
 * order until one answers. The public ones are shared by the whole OSM world
 * and enforce a per-IP slot limit, so an operator with real traffic should
 * point this at their own mirror rather than lean harder on overpass-api.de.
 *
 * There are two by default because overpass-api.de under load answers a
 * perfectly good query with 504 — seen in production, where the identical query
 * succeeded a minute later. A second instance is only ever contacted after the
 * first has already failed, so this costs the mirrors nothing in the normal case.
 *
 * OVERPASS_URLS takes a comma-separated list; the older single-valued
 * OVERPASS_URL still works and is then the only instance used, since an
 * operator naming their own mirror has not asked us to fall back to public ones.
 */
const DEFAULT_OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function configuredOverpassUrls(): string[] {
  const list = (process.env.OVERPASS_URLS || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  if (list.length > 0) return list;
  return process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : DEFAULT_OVERPASS_URLS;
}

export const OVERPASS_URLS = configuredOverpassUrls();

/**
 * Whether the optional configuration is present, as booleans rather than the
 * values themselves. /api/health reports these so a deployment can be checked
 * from outside without ever exposing the address or the key. Without this,
 * confirming that an environment variable reached the functions means trusting
 * the dashboard — the endpoints behave identically either way.
 */
export const HAS_CONTACT = CONTACT !== '';
export const HAS_ROUTING_KEY = OPENROUTESERVICE_API_KEY !== '';

/** Behind a load balancer, rate limiting needs the forwarded client IP. */
export const TRUST_PROXY = process.env.TRUST_PROXY || (IS_PRODUCTION ? '1' : '');

export function warnAboutMissingConfig(): void {
  if (!CONTACT) {
    console.warn(
      '[config] CONTACT_EMAIL is not set. MET.no and Nominatim both ask for a contact\n' +
        '         address in the User-Agent and may block anonymous traffic. Set it before\n' +
        '         running a public instance.'
    );
  }
  if (!OPENROUTESERVICE_API_KEY) {
    console.info('[config] No OPENROUTESERVICE_API_KEY — falling back to public OSRM for routing.');
  }
}
