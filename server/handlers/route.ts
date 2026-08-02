import { TtlCache } from '../cache.js';
import { OPENROUTESERVICE_API_KEY } from '../config.js';
import { UpstreamError, fetchJson } from '../upstream.js';
import {
  cumulativeDistancesKm,
  curvatureDegPerKm,
  haversineDistance,
  isValidCoord,
} from '../../src/utils/geo.js';
import type { RouteProfile } from '../../src/types.js';
import { curvatureRankingApplies, normalizeProfile } from '../../src/utils/routeProfile.js';
import { badRequest, type ApiResult } from './apiResult.js';

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
 *
 * The adjustment used to be keyed to the riding style the rider picked, so the
 * very same road was reported twenty percent slower under "Svingete veier" than
 * under "Raskeste". On a long route — where there is only ever one route to be
 * had — the distance and the line on the map stayed put while the time jumped,
 * and a rider comparing the two read that as invented. Fairly.
 *
 * A road takes as long as it takes. The pace follows the route's own measured
 * curvature, so the same road always gets the same estimate, and a genuinely
 * twistier alternative is genuinely slower.
 */
const STRAIGHT_DEG_PER_KM = 50;
const TWISTY_DEG_PER_KM = 250;
const MAX_PACE_ADJUSTMENT = 1.2;

/**
 * Degrees of heading change per kilometre, mapped to how much slower than the
 * car estimate to call it. A motorway sits near 20°/km and gets no adjustment;
 * a measured fjord-valley road over a pass — Åndalsnes to Valldal comes back at
 * 251 — gets the full one. In between it scales evenly rather than stepping.
 */
export function paceAdjustment(curvatureDegPerKm: number): number {
  const share = (curvatureDegPerKm - STRAIGHT_DEG_PER_KM) / (TWISTY_DEG_PER_KM - STRAIGHT_DEG_PER_KM);
  return 1 + Math.min(1, Math.max(0, share)) * (MAX_PACE_ADJUSTMENT - 1);
}

/**
 * Every route's estimated time goes through here, whichever engine produced it.
 *
 * The OpenRouteService path used to skip the adjustment entirely and hand back
 * ORS's raw car estimate, so the same tour was reported twenty percent quicker
 * on an instance that had a routing key than on one that fell back to OSRM.
 */
export function estimatedDurationMin(rawSeconds: number, curvatureDegPerKm: number): number {
  return Math.round((rawSeconds / 60) * paceAdjustment(curvatureDegPerKm));
}

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

/** Calculates a route from an untrusted request payload. Host-neutral. */
export async function handleRouteRequest(payload: unknown): Promise<ApiResult> {
  const { coordinates, profile = 'curvy', avoidHighways = true } = (payload ?? {}) as RouteRequestBody;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return badRequest('Minst to koordinater (start og slutt) er påkrevd.');
  }

  if (coordinates.length > MAX_WAYPOINTS) {
    return badRequest(`Maks ${MAX_WAYPOINTS} rutepunkter per rute.`);
  }

  const invalid = coordinates.some(
    (c) => !Array.isArray(c) || c.length < 2 || !isValidCoord(c[1], c[0])
  );
  if (invalid) {
    return badRequest('Ett eller flere rutepunkter har ugyldige koordinater.');
  }

  const resolvedProfile = normalizeProfile(profile);

  const cacheKey = JSON.stringify([
    coordinates.map(([lng, lat]) => [round5(lng), round5(lat)]),
    resolvedProfile,
    avoidHighways,
  ]);

  try {
    const result = await routeCache.wrap(cacheKey, () =>
      calculateRoute(coordinates, resolvedProfile, Boolean(avoidHighways))
    );
    return { status: 200, body: result };
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.warn(`[route] ${err.message}`);
      return { status: 502, body: { error: `Ruteberegning feilet: ${err.message}` } };
    }
    console.error('[route] unexpected error:', err);
    return { status: 500, body: { error: 'Kunne ikke beregne MC-rute.' } };
  }
}

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

export interface OrsFeature {
  geometry: { coordinates: number[][] };
  properties: { summary: { distance: number; duration: number } };
}

interface OrsResponse {
  features?: OrsFeature[];
}

/**
 * Applies the same curvature ranking to ORS alternatives that we use for OSRM's.
 *
 * ORS has no motorcycle profile and no curvature weighting of its own, so
 * without this the ORS path would return whatever a car would drive. Motorways
 * are already excluded upstream via avoid_features, so curvature alone decides.
 */
export function pickCurviestFeature(
  features: OrsFeature[],
  profile: RouteProfile,
  avoidHighways: boolean
): OrsFeature | null {
  if (features.length === 0) return null;
  if (features.length === 1 || profile === 'fastest') return features[0];

  let best = features[0];
  let bestScore = -Infinity;

  for (const feature of features) {
    const line: [number, number][] = feature.geometry.coordinates.map((c) => [c[1], c[0]]);
    const score = scoreRoute(line, 0, profile, avoidHighways);
    if (score > bestScore) {
      bestScore = score;
      best = feature;
    }
  }

  return best;
}

/**
 * ORS only offers alternatives for point-to-point routes, same as OSRM. The
 * window itself lives in src/utils/routeProfile so the planner can tell the
 * rider when picking a riding style will not change the road.
 */
export function wantsOrsAlternatives(
  coordinates: [number, number][],
  profile: RouteProfile
): boolean {
  return (
    profile !== 'fastest' &&
    curvatureRankingApplies(coordinates.map(([lng, lat]) => ({ lat, lng })))
  );
}

async function routeViaOpenRouteService(
  coordinates: [number, number][],
  profile: RouteProfile,
  avoidHighways: boolean
): Promise<RouteResponse> {
  // OpenRouteService has no motorcycle profile. Its full set is driving-car,
  // driving-hgv, four cycling profiles, two foot profiles and wheelchair — see
  // https://giscience.github.io/openrouteservice/run-instance/configuration/engine/profiles/
  // An earlier version asked for "driving-motorcycle", which does not exist, so
  // every ORS request failed and silently fell back to OSRM. Motorcycle-specific
  // behaviour comes from avoid_features plus the curvature ranking below.
  const body: Record<string, unknown> = {
    coordinates,
    elevation: true,
    instructions: false,
    preference: profile === 'fastest' ? 'fastest' : 'recommended',
  };

  if (avoidHighways || profile !== 'fastest') {
    body.options = { avoid_features: ['highways', 'tollways'] };
  }

  if (wantsOrsAlternatives(coordinates, profile)) {
    body.alternative_routes = { target_count: 3, share_factor: 0.6, weight_factor: 1.6 };
  }

  const data = await fetchJson<OrsResponse>(
    'OpenRouteService',
    'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
    {
      method: 'POST',
      body,
      // The /geojson variant only accepts this MIME type; fetchJson's default
      // Accept: application/json gets a valid, authenticated request rejected
      // with 406 before ORS even looks at the body.
      headers: { Authorization: OPENROUTESERVICE_API_KEY, Accept: 'application/geo+json' },
    }
  );

  const feature = pickCurviestFeature(data.features ?? [], profile, avoidHighways);
  if (!feature) {
    throw new UpstreamError('OpenRouteService', 'Fant ingen rute mellom de valgte punktene');
  }

  return buildRouteResponseFromOrsFeature(feature);
}

/**
 * Shared by point-to-point ORS routing and the round-trip loop generator below.
 *
 * Deliberately knows nothing about the riding style: a route is a road, and
 * which button asked for it cannot change how long it takes to ride. The style
 * decides which route we end up here with, not what we say about it.
 */
export function buildRouteResponseFromOrsFeature(feature: OrsFeature): RouteResponse {
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
  const curvature = Math.round(curvatureDegPerKm(polyline));
  const durationMin = estimatedDurationMin(summary.duration, curvature);

  return {
    polyline,
    distanceKm,
    durationMin,
    elevationPoints,
    summary: {
      distanceKm,
      durationMin,
      ...elevationStats(elevations ? elevationPoints : null),
      curvatureDegPerKm: curvature,
    },
    sources: {
      routing: 'OpenRouteService',
      elevation: elevations ? 'OpenRouteService (SRTM)' : null,
    },
    notes: buildNotes(elevations !== null),
  };
}

/* -------------------------------------------------------------------------- */
/* Nearby loop (round trip)                                                    */
/* -------------------------------------------------------------------------- */

// ORS's public API restricts round_trip requests to roughly 100-150 km of road
// distance, and straight-line "radius" isn't the same number the API enforces.
// The cap here stays well under that so a curvy detour doesn't push the actual
// loop length past what ORS will accept.
const LOOP_MIN_RADIUS_KM = 10;
const LOOP_MAX_RADIUS_KM = 80;

// ORS's own documented example for round_trip.points is 5 ("larger values create
// more circular routes"). There's no local way to test alternatives against the
// real API, so this stays at the documented default rather than a guessed curve.
const LOOP_ROUND_TRIP_POINTS = 5;

interface NearbyRouteRequestBody {
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

/**
 * Generates a scenic loop back to the rider's own position — ORS's round_trip
 * option. OSRM's public instance has no equivalent, so unlike point-to-point
 * routing there is no fallback: without a configured key this whole feature is
 * unavailable, and says so rather than returning something that looks like a
 * route but isn't.
 */
export async function handleNearbyRouteRequest(payload: unknown): Promise<ApiResult> {
  const { lat, lng, radiusKm } = (payload ?? {}) as NearbyRouteRequestBody;

  if (typeof lat !== 'number' || typeof lng !== 'number' || !isValidCoord(lat, lng)) {
    return badRequest('Ugyldig eller manglende posisjon.');
  }

  if (typeof radiusKm !== 'number' || !Number.isFinite(radiusKm)) {
    return badRequest('Radius mangler eller er ugyldig.');
  }

  if (radiusKm < LOOP_MIN_RADIUS_KM || radiusKm > LOOP_MAX_RADIUS_KM) {
    return badRequest(`Radius må være mellom ${LOOP_MIN_RADIUS_KM} og ${LOOP_MAX_RADIUS_KM} km.`);
  }

  if (!OPENROUTESERVICE_API_KEY) {
    return {
      status: 503,
      body: {
        error:
          'Rundturer krever en konfigurert OpenRouteService-nøkkel. OSRM har ingen tilsvarende funksjon.',
      },
    };
  }

  try {
    const result = await routeViaOrsRoundTrip(lat, lng, radiusKm);
    return { status: 200, body: result };
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.warn(`[route] nearby loop: ${err.message}${err.detail ? ` — ORS: ${err.detail}` : ''}`);

      // The rider's own position, nowhere near a road. Nothing upstream is
      // wrong and nothing about the loop is the problem, so say what is.
      if (err.code === ORS_NO_ROUTABLE_POINT) {
        return {
          status: 422,
          body: {
            error:
              'Fant ingen kjørbar vei nær posisjonen din. Flytt startpunktet nærmere en vei — klikk i kartet der du vil starte — og prøv igjen.',
          },
        };
      }

      // Every attempt exhausted, at four different lengths. Repeating the
      // upstream status back at the rider tells them nothing they can act on;
      // what they can act on is a different length or a different starting
      // point, which is what actually gets a loop out of narrow terrain.
      if (isRetryableRoundTripFailure(err)) {
        return {
          status: 502,
          body: {
            error:
              'Fant ingen rundtur herfra. Rundturer lages av en eksperimentell tjeneste som ofte kommer til kort i trange veinett — prøv en annen lengde, eller start et sted med flere veivalg.',
          },
        };
      }

      return { status: 502, body: { error: `Kunne ikke lage rundtur: ${err.message}` } };
    }
    console.error('[route] nearby loop unexpected error:', err);
    return { status: 500, body: { error: 'Kunne ikke lage rundtur.' } };
  }
}

// ORS's round_trip is randomised and, by its own documentation, experimental:
// the same request with a different seed can fail where another succeeds. This
// showed up immediately on real terrain — in the narrow road network around a
// fjord-valley town like Åndalsnes, roughly half of single attempts came back
// as a plain ORS-side 500, not a request problem on our end. A few retries with
// a fresh seed each time turns that into a route the rider actually sees.
const ROUND_TRIP_ATTEMPTS = 4;

/**
 * ORS answers "could not find a routable point within 350 metres of your
 * coordinate" with code 2010 — and, confusingly, an HTTP 404, the same status
 * as the transient blips below. No number of fresh seeds moves the rider closer
 * to a road, so four attempts at this are four ways of saying the same thing
 * slowly. We only learned to tell them apart once UpstreamError started
 * carrying the service's own code.
 */
const ORS_NO_ROUTABLE_POINT = 2010;

/**
 * ORS-side round_trip failures are a bare 500. Also seen twice in production:
 * a 404 for this exact same hardcoded URL, on requests otherwise identical to
 * ones that succeeded seconds apart — since the path never varies, that can
 * only be a transient blip on ORS's own infrastructure, never a real "this
 * endpoint doesn't exist". Anything else (401/403 key problems, 429 rate
 * limits, 400 bad requests) is a real problem worth surfacing immediately.
 *
 * A failure with no status at all — our own timeout, a dropped connection, or
 * ORS returning a loop-less answer — is retryable too. Generating a loop is
 * slow work that sometimes overruns, and abandoning the remaining attempts over
 * one slow response threw away the very retries that make this feature work.
 */
export function isRetryableRoundTripFailure(err: unknown): boolean {
  if (!(err instanceof UpstreamError)) return false;
  if (err.code === ORS_NO_ROUTABLE_POINT) return false;
  return err.status === undefined || err.status === 500 || err.status === 404;
}

/**
 * Length multipliers, one per attempt. Four rolls of the same die is a single
 * experiment repeated; nudging the target length gives ORS's algorithm a
 * materially different problem each time, which is what a constrained road
 * network — a fjord valley with two ways out — actually needs. The first
 * attempt asks for exactly what the rider picked.
 */
const ROUND_TRIP_LENGTH_FACTORS = [1, 0.85, 1.2, 0.7];

async function routeViaOrsRoundTrip(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<RouteResponse> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= ROUND_TRIP_ATTEMPTS; attempt++) {
    const lengthM = Math.round(radiusKm * 1000 * ROUND_TRIP_LENGTH_FACTORS[attempt - 1]);
    const body = {
      coordinates: [[lng, lat]],
      elevation: true,
      instructions: false,
      options: {
        avoid_features: ['highways', 'tollways'],
        round_trip: {
          length: lengthM,
          points: LOOP_ROUND_TRIP_POINTS,
          // A fresh seed every attempt: asking again is how ORS's own
          // randomised algorithm gets another chance to find a valid loop.
          seed: Math.floor(Math.random() * 1_000_000),
        },
      },
    };

    try {
      const data = await fetchJson<OrsResponse>(
        'OpenRouteService',
        'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
        {
          method: 'POST',
          body,
          headers: { Authorization: OPENROUTESERVICE_API_KEY, Accept: 'application/geo+json' },
          // Building a loop with elevation is real work, and 6 seconds cut off
          // answers that were still coming — every one of which cost an attempt.
          timeoutMs: 10_000,
        }
      );

      const feature = data.features?.[0];
      if (!feature) {
        throw new UpstreamError('OpenRouteService', 'Fant ingen rundtur fra denne posisjonen');
      }

      // A generated loop is a curvy back-road ride by construction, and the
      // planner switches the rider to that style when one comes back.
      const response = buildRouteResponseFromOrsFeature(feature);
      response.notes.push(
        'Rundturen er generert automatisk og følger ikke nødvendigvis den mest opplagte veien — se over ruten før du kjører.'
      );
      return response;
    } catch (err) {
      lastErr = err;
      if (!isRetryableRoundTripFailure(err)) throw err;

      // ORS's own explanation, not just the status — a bare "svarte 500" is
      // what made the last round of these impossible to tell apart.
      const detail = err instanceof UpstreamError && err.detail ? ` — ORS: ${err.detail}` : '';
      console.warn(
        `[route] nearby loop attempt ${attempt}/${ROUND_TRIP_ATTEMPTS} (${Math.round(lengthM / 1000)} km) failed: ${
          err instanceof Error ? err.message : err
        }${detail}`
      );
    }
  }

  throw lastErr;
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
  const curvature = Math.round(curvatureDegPerKm(polyline));
  const durationMin = estimatedDurationMin(chosen.duration, curvature);

  return {
    polyline,
    distanceKm,
    durationMin,
    elevationPoints,
    summary: {
      distanceKm,
      durationMin,
      ...elevationStats(elevation ? elevationPoints : null),
      curvatureDegPerKm: curvature,
    },
    sources: { routing: 'OSRM', elevation: elevation?.source ?? null },
    notes: buildNotes(elevation !== null),
  };
}

/**
 * Scores a candidate route for the requested riding style.
 *
 * Curvature — degrees of heading change per kilometre — is the thing riders
 * actually want. Scoring by raw distance, as an earlier version did, makes
 * "curvy" mean "longest" and happily picks a straight detour.
 *
 * Shared by both routing backends so the two paths cannot drift apart.
 */
export function scoreRoute(
  line: [number, number][],
  highwayFraction: number,
  profile: RouteProfile,
  avoidHighways: boolean
): number {
  const highwayWeight = avoidHighways ? 200 : 60;
  const curvatureWeight = profile === 'fastest' ? 0 : 1;
  return curvatureWeight * curvatureDegPerKm(line) - highwayWeight * highwayFraction;
}

/** Picks the best of OSRM's alternative routes for the requested riding style. */
export function pickBestRoute(routes: OsrmRoute[], profile: RouteProfile, avoidHighways: boolean): OsrmRoute {
  if (profile === 'fastest' && !avoidHighways) return routes[0];
  if (routes.length === 1) return routes[0];

  let best = routes[0];
  let bestScore = -Infinity;

  for (const candidate of routes) {
    const line: [number, number][] = candidate.geometry.coordinates.map((c) => [c[1], c[0]]);
    const totalKm = candidate.distance / 1000;
    const highwayFraction = totalKm > 0 ? estimateHighwayKm(candidate) / totalKm : 0;

    const score = scoreRoute(line, highwayFraction, profile, avoidHighways);
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
