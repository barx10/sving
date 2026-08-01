import { TtlCache } from '../cache.js';
import { OVERPASS_URL } from '../config.js';
import { UpstreamError, createThrottle, fetchJson } from '../upstream.js';
import { isValidCoord } from '../../src/utils/geo.js';
import { badRequest, type ApiResult } from './apiResult.js';

/**
 * Fuel stations and rest areas along a route, from OpenStreetMap via Overpass.
 *
 * This is live data rather than a curated file like the mountain passes: a
 * station that closed last spring should stop showing up, and no hand-kept list
 * of Norwegian petrol stations stays honest for long.
 *
 * Overpass is the most fragile upstream this app touches. It is a shared public
 * service with a per-IP slot limit, queries are expensive, and a busy instance
 * answers with 429 or a gateway timeout rather than queueing politely. Four
 * things keep this app a good citizen, in the order they take effect:
 *
 *   1. One request covers both categories, so switching tabs in the UI is free.
 *   2. Identical routes share a cached answer for six hours.
 *   3. Concurrent requests for the same route wait on one lookup, not several.
 *   4. Everything else is serialised with a gap, and the queue behind it is
 *      capped — past that we say we are busy instead of burying Overpass.
 */

/** Points a rider passes rarely move. Six hours is still fresh enough. */
const poiCache = new TtlCache<PointOfInterest[]>(6 * 60 * 60 * 1000, 200);

/**
 * Overpass asks for at most two concurrent queries per IP and is happier with
 * fewer. On serverless hosting this only spans one warm instance, which is the
 * same caveat the Nominatim throttle carries — the cache above is what keeps
 * the total call volume down across instances.
 */
const throttleOverpass = createThrottle(1500);

/** In-flight lookups, so a popular route costs one Overpass query, not five. */
const inFlight = new Map<string, Promise<PointOfInterest[]>>();

/**
 * How many callers may be waiting on Overpass at once. Beyond this we fail
 * fast: a queue this deep means every rider in it times out anyway, and piling
 * more on is how an IP gets blocked.
 */
const MAX_QUEUED_LOOKUPS = 6;
let queuedLookups = 0;

/** Corridor half-widths, in metres. Fuel is worth a longer detour than a bench. */
const FUEL_RADIUS_M = 2500;
const REST_RADIUS_M = 1500;

/** Overpass is asked for at most this many results, and we keep the closest. */
const MAX_RESULTS = 250;

/** Enough sampled points to describe a corridor, few enough to stay cheap. */
const MAX_POINTS = 80;

/**
 * The app plans motorcycle tours in Norway. Accepting coordinates anywhere on
 * earth would turn this endpoint into a free, anonymous Overpass proxy pointed
 * at our IP, and our IP is the one that gets blocked for it.
 */
const NORDIC_BOUNDS = { minLat: 54, maxLat: 72, minLng: -2, maxLng: 35 };

export type PoiCategory = 'fuel' | 'rest_area';

export interface PointOfInterest {
  id: string;
  category: PoiCategory;
  name: string;
  lat: number;
  lng: number;
  brand?: string;
  openingHours?: string;
  /** Norwegian rest areas are well mapped for this, and riders ask. */
  hasToilets?: boolean;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

/**
 * Overpass reads a coordinate list in `around` as a polyline and searches the
 * corridor along it, not just circles at each vertex — which is why the caller
 * can sample sparsely and still get everything beside the road between samples.
 */
function buildQuery(points: [number, number][]): string {
  const coords = points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',');

  return `[out:json][timeout:25];
(
  nwr(around:${FUEL_RADIUS_M},${coords})["amenity"="fuel"];
  nwr(around:${REST_RADIUS_M},${coords})["highway"="rest_area"];
  nwr(around:${REST_RADIUS_M},${coords})["tourism"="picnic_site"];
);
out center ${MAX_RESULTS};`;
}

function toPointOfInterest(element: OverpassElement): PointOfInterest | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const tags = element.tags ?? {};
  const category: PoiCategory = tags.amenity === 'fuel' ? 'fuel' : 'rest_area';
  const brand = tags.brand || tags.operator;

  // Statens vegvesen's rest areas are often mapped without a name but with a
  // Norwegian description ("Hovedrasteplass"), which beats a generic label.
  const described = tags['description:no'] || tags.description;

  return {
    id: `${element.type}/${element.id}`,
    category,
    name:
      tags.name || brand || described || (category === 'fuel' ? 'Bensinstasjon' : 'Rasteplass'),
    lat,
    lng,
    ...(brand ? { brand } : {}),
    ...(tags.opening_hours ? { openingHours: tags.opening_hours } : {}),
    ...(tags.toilets === 'yes' ? { hasToilets: true } : {}),
  };
}

/**
 * OSM routinely holds the same station twice — once as the shop node and once
 * as the forecourt way — and a rider does not care about the distinction.
 * Rounding to roughly a hundred metres collapses the pair.
 */
function dedupe(pois: PointOfInterest[]): PointOfInterest[] {
  const seen = new Set<string>();

  return pois.filter((poi) => {
    const key = `${poi.category}:${poi.lat.toFixed(3)},${poi.lng.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function lookup(points: [number, number][]): Promise<PointOfInterest[]> {
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(buildQuery(points))}`;

  // Overpass' own [timeout:25] is the server-side budget; ours has to outlast
  // it, or we abandon queries it is still paying to run.
  const data = await throttleOverpass(() =>
    fetchJson<OverpassResponse>('Overpass', url, { timeoutMs: 30_000 })
  );

  const elements = Array.isArray(data.elements) ? data.elements : [];
  return dedupe(elements.map(toPointOfInterest).filter((poi): poi is PointOfInterest => poi !== null));
}

/**
 * Rounded to about a kilometre, so two riders planning the same road share an
 * answer even when their sampled points do not land on identical coordinates.
 */
function cacheKey(points: [number, number][]): string {
  return points.map(([lat, lng]) => `${lat.toFixed(2)},${lng.toFixed(2)}`).join(';');
}

function withinBounds(lat: number, lng: number): boolean {
  return (
    lat >= NORDIC_BOUNDS.minLat &&
    lat <= NORDIC_BOUNDS.maxLat &&
    lng >= NORDIC_BOUNDS.minLng &&
    lng <= NORDIC_BOUNDS.maxLng
  );
}

/** Fuel and rest areas in a corridor along the sampled route. Host-neutral. */
export async function handlePoisRequest(payload: unknown): Promise<ApiResult> {
  const { points } = (payload ?? {}) as { points?: unknown };

  if (!Array.isArray(points) || points.length < 2) {
    return badRequest('Ruten mangler punkter å søke langs.');
  }

  if (points.length > MAX_POINTS) {
    return badRequest(`For mange punkter i én forespørsel (maks ${MAX_POINTS}).`);
  }

  const parsed: [number, number][] = [];

  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2) {
      return badRequest('Hvert punkt må være [lat, lng].');
    }

    const [lat, lng] = point as [unknown, unknown];
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isValidCoord(lat, lng)) {
      return badRequest('Ugyldige koordinater i ruten.');
    }

    if (!withinBounds(lat, lng)) {
      return badRequest('Søk etter bensin og rasteplasser dekker bare Norden.');
    }

    parsed.push([lat, lng]);
  }

  const key = cacheKey(parsed);

  const cached = poiCache.get(key);
  if (cached) return ok(cached);

  const pending = inFlight.get(key);
  if (pending) {
    try {
      return ok(await pending);
    } catch (err) {
      return upstreamFailure(err);
    }
  }

  if (queuedLookups >= MAX_QUEUED_LOOKUPS) {
    return {
      status: 503,
      body: { error: 'Kartsøket er opptatt akkurat nå. Prøv igjen om et minutt.' },
      headers: { 'Retry-After': '60' },
    };
  }

  queuedLookups += 1;
  const request = lookup(parsed);
  inFlight.set(key, request);

  try {
    const pois = await request;
    poiCache.set(key, pois);
    return ok(pois);
  } catch (err) {
    return upstreamFailure(err);
  } finally {
    queuedLookups -= 1;
    inFlight.delete(key);
  }
}

function ok(pois: PointOfInterest[]): ApiResult {
  return {
    status: 200,
    body: { pois, source: 'OpenStreetMap via Overpass API' },
  };
}

function upstreamFailure(err: unknown): ApiResult {
  if (err instanceof UpstreamError) {
    console.warn(`[pois] ${err.message}`);

    // 429 is Overpass saying we are over our slot allowance, 504 that the query
    // outran its own budget. Both clear up on their own; neither is worth a
    // retry from the client right away.
    if (err.status === 429) {
      return {
        status: 503,
        body: { error: 'Kartsøket er opptatt akkurat nå. Prøv igjen om et minutt.' },
        headers: { 'Retry-After': '60' },
      };
    }

    return {
      status: 502,
      body: { error: 'Fant ikke bensinstasjoner og rasteplasser akkurat nå. Prøv igjen senere.' },
    };
  }

  console.error('[pois] unexpected error:', err);
  return { status: 500, body: { error: 'Uventet feil under søk langs ruten.' } };
}
