import type {
  HazardReport,
  RouteProfile,
  RouteResult,
  WeatherCheckpoint,
  Waypoint,
} from './types';
import { hasCoords } from './utils/geo';

/**
 * Typed client for this app's own API.
 *
 * Everything that touches an external service goes through our server: it holds
 * the identifying User-Agent those services require, caches responses so two
 * riders planning the same classic route cost one upstream call, and rate limits
 * abuse before it gets our IP banned.
 */

export class ApiError extends Error {}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError('Ingen kontakt med serveren. Er du på nett?');
  }

  if (!response.ok) {
    const message = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);
    throw new ApiError(message || `Forespørselen feilet (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

export function fetchRoute(
  waypoints: Waypoint[],
  profile: RouteProfile,
  avoidHighways: boolean,
  signal?: AbortSignal
): Promise<RouteResult> {
  const coordinates = waypoints.filter(hasCoords).map((wp) => [wp.lng, wp.lat]);

  return requestJson<RouteResult>('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates, profile, avoidHighways }),
    signal,
  });
}

/**
 * A scenic loop back to the given position. The server picks a fresh random
 * shape each call, so calling this again with the same arguments is how a
 * rider asks for a different loop, not a duplicate request.
 */
export function fetchNearbyRoute(
  lat: number,
  lng: number,
  radiusKm: number,
  signal?: AbortSignal
): Promise<RouteResult> {
  return requestJson<RouteResult>('/api/route-nearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, radiusKm }),
    signal,
  });
}

export interface WeatherRequestPoint {
  lat: number;
  lng: number;
  label: string;
  /** ISO timestamp for when the rider expects to reach this point. */
  time: string;
}

export function fetchWeather(
  points: WeatherRequestPoint[],
  signal?: AbortSignal
): Promise<{ weather: WeatherCheckpoint[] }> {
  return requestJson<{ weather: WeatherCheckpoint[] }>('/api/weather', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal,
  });
}

export function fetchHazards(signal?: AbortSignal): Promise<HazardReport> {
  return requestJson<HazardReport>('/api/hazards', { signal });
}

export interface PlaceResult {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lng: number;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const { results } = await requestJson<{ results: PlaceResult[] }>(
    `/api/geocode/search?q=${encodeURIComponent(query)}`,
    { signal }
  );
  return results;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<string | null> {
  const { name } = await requestJson<{ name: string | null }>(
    `/api/geocode/reverse?lat=${lat}&lng=${lng}`,
    { signal }
  );
  return name;
}
