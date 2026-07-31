import { Router, type Request, type Response } from 'express';
import { TtlCache } from '../cache';
import { UpstreamError, createThrottle, fetchJson } from '../upstream';
import { isValidCoord } from '../../src/utils/geo';

export const geocodeRouter = Router();

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

geocodeRouter.get('/search', async (req: Request, res: Response) => {
  const query = String(req.query.q || '').trim();

  if (query.length < 2) {
    res.status(400).json({ error: 'Søket må være minst to tegn.' });
    return;
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

    res.json({ results });
  } catch (err) {
    respondUpstream(res, err, 'Stedssøket er ikke tilgjengelig akkurat nå.');
  }
});

geocodeRouter.get('/reverse', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!isValidCoord(lat, lng)) {
    res.status(400).json({ error: 'Ugyldige koordinater.' });
    return;
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

    res.json({ name: name || null });
  } catch (err) {
    respondUpstream(res, err, 'Kunne ikke slå opp stedsnavn.');
  }
});

function respondUpstream(res: Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof UpstreamError) {
    console.warn(`[geocode] ${err.message}`);
    res.status(502).json({ error: fallbackMessage });
    return;
  }
  console.error('[geocode] unexpected error:', err);
  res.status(500).json({ error: fallbackMessage });
}
