import { TtlCache } from '../cache';
import { UpstreamError, createThrottle, fetchJson } from '../upstream';
import { isValidCoord } from '../../src/utils/geo';
import { badRequest, type ApiResult } from './apiResult';

/**
 * Nominatim proxy.
 *
 * These calls used to go straight from the browser. That breaks in two ways:
 * browsers silently drop the User-Agent header the code tried to set (it is a
 * forbidden header), so the requests arrived anonymous, and Nominatim's usage
 * policy asks for a single identified backend rather than one request per user.
 * Once more than a handful of riders used the app it would have been blocked.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';

/** Place names do not move. A day of caching is conservative. */
const searchCache = new TtlCache<PlaceResult[]>(24 * 60 * 60 * 1000, 1000);
const reverseCache = new TtlCache<string>(24 * 60 * 60 * 1000, 1000);

/** Nominatim allows at most one request per second, globally. */
const throttleNominatim = createThrottle(1100);

/**
 * Place names never change on interesting timescales, so successful lookups
 * are also cached at the CDN edge. On serverless hosting this matters extra:
 * the in-memory cache and throttle above only span one warm instance, and the
 * edge cache is what keeps repeat lookups away from Nominatim entirely.
 */
const EDGE_CACHE = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };

export interface PlaceResult {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lng: number;
}

interface NominatimSearchEntry {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

interface NominatimReverseResponse {
  display_name?: string;
  address?: Record<string, string>;
}

/** Free-text place search, limited to Norway. Host-neutral. */
export async function handleGeocodeSearch(rawQuery: unknown): Promise<ApiResult> {
  const query = String(rawQuery ?? '').trim();

  if (query.length < 2) {
    return badRequest('Søket må være minst to tegn.');
  }

  const cacheKey = query.toLowerCase();

  try {
    const results = await searchCache.wrap(cacheKey, async () => {
      const url =
        `${NOMINATIM}/search?q=${encodeURIComponent(query)}` +
        '&format=jsonv2&countrycodes=no&limit=6&addressdetails=1&accept-language=no';

      const entries = await throttleNominatim(() =>
        fetchJson<NominatimSearchEntry[]>('Nominatim', url)
      );

      return entries.map((entry) => ({
        id: String(entry.place_id),
        name: entry.name || entry.display_name.split(',')[0],
        displayName: entry.display_name,
        lat: parseFloat(entry.lat),
        lng: parseFloat(entry.lon),
      }));
    });

    return { status: 200, body: { results }, headers: EDGE_CACHE };
  } catch (err) {
    return upstreamFailure(err, 'Stedssøket er ikke tilgjengelig akkurat nå.');
  }
}

/** Nearest place name for a coordinate. Host-neutral. */
export async function handleGeocodeReverse(rawLat: unknown, rawLng: unknown): Promise<ApiResult> {
  // Missing parameters arrive as undefined from Express but as null from the
  // web URL API, and Number(null) is 0 — a valid coordinate in the Gulf of
  // Guinea. Reject absence explicitly so it cannot coerce into a real lookup.
  if (rawLat == null || rawLat === '' || rawLng == null || rawLng === '') {
    return badRequest('Ugyldige koordinater.');
  }

  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (!isValidCoord(lat, lng)) {
    return badRequest('Ugyldige koordinater.');
  }

  // Three decimals (~100 m) is plenty for a place name and gives the cache
  // something to actually hit when riders click near the same spot.
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;

  try {
    const name = await reverseCache.wrap(cacheKey, async () => {
      const url =
        `${NOMINATIM}/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}` +
        '&format=jsonv2&zoom=14&addressdetails=1&accept-language=no';

      const data = await throttleNominatim(() =>
        fetchJson<NominatimReverseResponse>('Nominatim', url)
      );

      const address = data.address || {};
      const preferred =
        address.village ||
        address.town ||
        address.city ||
        address.municipality ||
        address.suburb ||
        address.road;

      if (preferred) return preferred;
      if (data.display_name) return data.display_name.split(',')[0];
      return '';
    });

    return { status: 200, body: { name: name || null }, headers: EDGE_CACHE };
  } catch (err) {
    return upstreamFailure(err, 'Kunne ikke slå opp stedsnavn.');
  }
}

function upstreamFailure(err: unknown, fallbackMessage: string): ApiResult {
  if (err instanceof UpstreamError) {
    console.warn(`[geocode] ${err.message}`);
    return { status: 502, body: { error: fallbackMessage } };
  }
  console.error('[geocode] unexpected error:', err);
  return { status: 500, body: { error: fallbackMessage } };
}
