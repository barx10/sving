import { Router, type Request, type Response } from 'express';
import { TtlCache } from '../cache';
import { OPENROUTESERVICE_API_KEY } from '../config';
import { UpstreamError, fetchJson } from '../upstream';
import { cumulativeDistancesKm, curvatureDegPerKm, isValidCoord } from '../../src/utils/geo';
import type { RouteProfile } from '../../src/types';

export const routeRouter = Router();

/** Roads do not change hour to hour; identical requests can share a result. */
const routeCache = new TtlCache<RouteResponse>(60 * 60 * 1000, 200);

const MAX_WAYPOINTS = 12;
/** How many points to look up elevation for. The free APIs cap batch size. */
const ELEVATION_SAMPLES = 75;

/**
 * Car routing engines assume you take the direct line through a corner at the
 * posted limit. On the kind of road this app deliberately seeks out, a real
 * rider is slower than that. This is an estimate and is labelled as one — it
 * also excludes ferry waits, fuel and coffee.
 */
const PACE_ADJUSTMENT: Record<RouteProfile, number> = {
  curvy: 1.2,
  scenic: 1.25,
  fastest: 1.0,
};

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
  lat: number;
  lng: number;
}

interface RouteResponse {
  polyline: [number, number][];
  distanceKm: number;
  durationMin: number;
  elevationPoints: ElevationPoint[];
  summary: {
    distanceKm: number;
    durationMin: number;
    /** Null when no elevation source was reachable — never invented. */
    elevationGainM: number | null;
    elevationLossM: number | null;
    maxElevationM: number | null;
    curvatureDegPerKm: number;
  };
  sources: {
    routing: string;
    /** Null when every elevation provider failed. */
    elevation: string | null;
  };
  notes: string[];
}

interface RouteRequestBody {
  coordinates?: [number, number][];
  profile?: RouteProfile;
  avoidHighways?: boolean;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

routeRouter.post('/', async (req: Request, res: Response) => {
  const { coordinates, profile = 'curvy', avoidHighways = true } = req.body as RouteRequestBody;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    res.status(400).json({ error: 'Minst to koordinater (start og slutt) er påkrevd.' });
    return;
  }

  if (coordinates.length > MAX_WAYPOINTS) {
    res.status(400).json({ error: `Maks ${MAX_WAYPOINTS} rutepunkter per rute.` });
    return;
  }

  const invalid = coordinates.some(
    (c) => !Array.isArray(c) || c.length < 2 || !isValidCoord(c[1], c[0])
  );
  if (invalid) {
    res.status(400).json({ error: 'Ett eller flere rutepunkter har ugyldige koordinater.' });
    return;
  }

  const resolvedProfile: RouteProfile = ['curvy', 'scenic', 'fastest'].includes(profile)
    ? profile
    : 'curvy';

  const cacheKey = JSON.stringify([
    coordinates.map(([lng, lat]) => [round5(lng), round5(lat)]),
    resolvedProfile,
    avoidHighways,
  ]);

  try {
    const result = await routeCache.wrap(cacheKey, () =>
      calculateRoute(coordinates, resolvedProfile, Boolean(avoidHighways))
    );
    res.json(result);
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.warn(`[route] ${err.message}`);
      res.status(502).json({ error: `Ruteberegning feilet: ${err.message}` });
      return;
    }
    console.error('[route] unexpected error:', err);
    res.status(500).json({ error: 'Kunne ikke beregne MC-rute.' });
  }
});

const round5 = (value: number): number => Number(value.toFixed(5));

async function calculateRoute(
  coordinates: [number, number][],
  profile: RouteProfile,
  avoidHighways: boolean
): Promise<RouteResponse> {
  if (OPENROUTESERVICE_API_KEY) {
    try {
      return await routeViaOpenRouteService(coordinates, profile, avoidHighways);
    } catch (err) {
      console.warn('[route] OpenRouteService failed, falling back to OSRM:', err);
    }
  }
  return routeViaOsrm(coordinates, profile, avoidHighways);
}

/* -------------------------------------------------------------------------- */
/* OpenRouteService                                                            */
/* -------------------------------------------------------------------------- */

interface OrsResponse {
  features?: {
    geometry: { coordinates: number[][] };
    properties: { summary: { distance: number; duration: number } };
  }[];
}

async function routeViaOpenRouteService(
  coordinates: [number, number][],
  profile: RouteProfile,
  avoidHighways: boolean
): Promise<RouteResponse> {
  const orsProfile =
    profile === 'fastest' && !avoidHighways ? 'driving-car' : 'driving-motorcycle';

  const body: Record<string, unknown> = {
    coordinates,
    elevation: true,
    instructions: false,
    preference: profile === 'fastest' ? 'fastest' : 'recommended',
  };

  if (avoidHighways || profile !== 'fastest') {
    body.options = { avoid_features: ['highways', 'tollways'] };
  }

  const data = await fetchJson<OrsResponse>(
    'OpenRouteService',
    `https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`,
    { method: 'POST', body, headers: { Authorization: OPENROUTESERVICE_API_KEY } }
  );

  const feature = data.features?.[0];
  if (!feature) {
    throw new UpstreamError('OpenRouteService', 'Fant ingen rute mellom de valgte punktene');
  }

  // ORS returns [lng, lat, elevation] when elevation is requested.
  const coords = feature.geometry.coordinates;
  const polyline: [number, number][] = coords.map((c) => [c[1], c[0]]);
  const distances = cumulativeDistancesKm(polyline);

  const hasElevation = coords.every((c) => typeof c[2] === 'number');
  const elevations = hasElevation ? coords.map((c) => c[2]) : null;

  const sampleStep = Math.max(1, Math.floor(coords.length / ELEVATION_SAMPLES));
  const elevationPoints: ElevationPoint[] = [];

  if (elevations) {
    for (let i = 0; i < coords.length; i++) {
      if (i === 0 || i === coords.length - 1 || i % sampleStep === 0) {
        elevationPoints.push({
          distanceKm: round1(distances[i]),
          elevationM: Math.round(elevations[i]),
          lat: polyline[i][0],
          lng: polyline[i][1],
        });
      }
    }
  }

  const { summary } = feature.properties;
  const distanceKm = round1(summary.distance / 1000);
  const durationMin = Math.round(summary.duration / 60);

  return {
    polyline,
    distanceKm,
    durationMin,
    elevationPoints,
    summary: {
      distanceKm,
      durationMin,
      ...elevationStats(elevations ? elevationPoints : null),
      curvatureDegPerKm: Math.round(curvatureDegPerKm(polyline)),
    },
    sources: {
      routing: 'OpenRouteService',
      elevation: elevations ? 'OpenRouteService (SRTM)' : null,
    },
    notes: buildNotes(elevations !== null),
  };
}

/* -------------------------------------------------------------------------- */
/* OSRM + separate elevation lookup                                            */
/* -------------------------------------------------------------------------- */

export interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs?: { steps?: { name?: string; distance: number }[] }[];
}

interface OsrmResponse {
  routes?: OsrmRoute[];
}

async function routeViaOsrm(
  coordinates: [number, number][],
  profile: RouteProfile,
  avoidHighways: boolean
): Promise<RouteResponse> {
  const coordsParam = coordinates.map((c) => `${c[0]},${c[1]}`).join(';');
  const url =
    `https://router.project-osrm.org/route/v1/driving/${coordsParam}` +
    '?overview=full&geometries=geojson&continue_straight=false&steps=true&alternatives=true';

  const data = await fetchJson<OsrmResponse>('OSRM', url);

  if (!data.routes || data.routes.length === 0) {
    throw new UpstreamError('OSRM', 'Fant ingen rute mellom de valgte punktene');
  }

  const chosen = pickBestRoute(data.routes, profile, avoidHighways);
  const polyline: [number, number][] = chosen.geometry.coordinates.map((c) => [c[1], c[0]]);
  const distances = cumulativeDistancesKm(polyline);

  const sampleIndices = pickSampleIndices(polyline.length, ELEVATION_SAMPLES);
  const elevation = await lookupElevations(sampleIndices.map((i) => polyline[i]));

  const elevationPoints: ElevationPoint[] = elevation
    ? sampleIndices.map((pointIndex, sampleIndex) => ({
        distanceKm: round1(distances[pointIndex]),
        elevationM: Math.round(elevation.values[sampleIndex]),
        lat: polyline[pointIndex][0],
        lng: polyline[pointIndex][1],
      }))
    : [];

  const distanceKm = round1(chosen.distance / 1000);
  const durationMin = Math.round((chosen.duration / 60) * PACE_ADJUSTMENT[profile]);

  return {
    polyline,
    distanceKm,
    durationMin,
    elevationPoints,
    summary: {
      distanceKm,
      durationMin,
      ...elevationStats(elevation ? elevationPoints : null),
      curvatureDegPerKm: Math.round(curvatureDegPerKm(polyline)),
    },
    sources: { routing: 'OSRM', elevation: elevation?.source ?? null },
    notes: buildNotes(elevation !== null),
  };
}

/**
 * Ranks OSRM's alternative routes for the requested riding style.
 *
 * The previous version scored candidates by raw distance, so "curvy" really
 * meant "longest", which happily picked a straight detour. Curvature measures
 * the thing riders actually want: degrees of turning per kilometre.
 */
export function pickBestRoute(routes: OsrmRoute[], profile: RouteProfile, avoidHighways: boolean): OsrmRoute {
  if (profile === 'fastest' && !avoidHighways) return routes[0];
  if (routes.length === 1) return routes[0];

  const highwayWeight = avoidHighways ? 200 : 60;
  const curvatureWeight = profile === 'fastest' ? 0 : 1;

  let best = routes[0];
  let bestScore = -Infinity;

  for (const candidate of routes) {
    const line: [number, number][] = candidate.geometry.coordinates.map((c) => [c[1], c[0]]);
    const totalKm = candidate.distance / 1000;
    const highwayFraction = totalKm > 0 ? estimateHighwayKm(candidate) / totalKm : 0;

    const score = curvatureWeight * curvatureDegPerKm(line) - highwayWeight * highwayFraction;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

/** Motorways in Norway are signed as E-roads; step names are the only hint OSRM gives us. */
function estimateHighwayKm(route: OsrmRoute): number {
  let km = 0;
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const name = (step.name || '').toUpperCase();
      if (/^E\s?\d+/.test(name) || name.includes('MOTORVEI')) {
        km += step.distance / 1000;
      }
    }
  }
  return km;
}

/** Evenly spaced indices along the polyline, always including both ends. */
export function pickSampleIndices(length: number, wanted: number): number[] {
  if (length <= wanted) return Array.from({ length }, (_, i) => i);

  const indices = new Set<number>();
  for (let i = 0; i < wanted; i++) {
    indices.add(Math.round((i / (wanted - 1)) * (length - 1)));
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Elevation for a set of points, or null when no provider answers.
 *
 * The original code had a third "fallback" that generated elevations from a
 * sine wave and shipped them under the label "Open-Meteo DEM". A fabricated
 * height profile is worse than no height profile, so that is gone: callers get
 * null and the UI says the data is unavailable.
 */
async function lookupElevations(
  points: [number, number][]
): Promise<{ values: number[]; source: string } | null> {
  try {
    const lats = points.map((p) => p[0].toFixed(5)).join(',');
    const lngs = points.map((p) => p[1].toFixed(5)).join(',');
    const data = await fetchJson<{ elevation?: (number | null)[] }>(
      'Open-Meteo',
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`
    );

    if (Array.isArray(data.elevation) && data.elevation.length === points.length) {
      const values = data.elevation;
      if (values.every((v): v is number => typeof v === 'number')) {
        return { values, source: 'Open-Meteo (Copernicus DEM 30 m)' };
      }
    }
  } catch (err) {
    console.warn('[route] Open-Meteo elevation failed:', err);
  }

  try {
    const data = await fetchJson<{ results?: { elevation?: number }[] }>(
      'Open-Elevation',
      'https://api.open-elevation.com/api/v1/lookup',
      {
        method: 'POST',
        body: { locations: points.map(([lat, lng]) => ({ latitude: lat, longitude: lng })) },
      }
    );

    const values = data.results?.map((r) => r.elevation);
    if (values && values.length === points.length && values.every((v): v is number => typeof v === 'number')) {
      return { values, source: 'Open-Elevation' };
    }
  } catch (err) {
    console.warn('[route] Open-Elevation failed:', err);
  }

  return null;
}

export function elevationStats(points: ElevationPoint[] | null): {
  elevationGainM: number | null;
  elevationLossM: number | null;
  maxElevationM: number | null;
} {
  if (!points || points.length === 0) {
    return { elevationGainM: null, elevationLossM: null, maxElevationM: null };
  }

  let gain = 0;
  let loss = 0;
  let max = points[0].elevationM;

  for (let i = 1; i < points.length; i++) {
    const diff = points[i].elevationM - points[i - 1].elevationM;
    if (diff > 0) gain += diff;
    else loss -= diff;
    if (points[i].elevationM > max) max = points[i].elevationM;
  }

  return {
    elevationGainM: Math.round(gain),
    elevationLossM: Math.round(loss),
    maxElevationM: Math.round(max),
  };
}

function buildNotes(hasElevation: boolean): string[] {
  const notes = [
    'Kjøretiden er et estimat og inkluderer ikke ferjer, pauser eller drivstoff.',
  ];
  if (hasElevation) {
    notes.push('Høydeprofilen er målt i utvalgte punkter, så stigningstallet er et minimum.');
  }
  return notes;
}
