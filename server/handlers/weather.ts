import { TtlCache } from '../cache';
import { UpstreamError, fetchJson } from '../upstream';
import { isValidCoord } from '../../src/utils/geo';
import { badRequest, type ApiResult } from './apiResult';

/**
 * MET.no forecasts along the route.
 *
 * Two things changed from the original implementation:
 *
 * 1. When MET.no failed, it used to return 16 °C, 4.2 m/s and 0 mm of rain,
 *    labelled in the UI as "Offisiell Yr / MET.no API". Telling a rider it is
 *    dry over Sognefjellet when we have no idea is the single most harmful thing
 *    this app could do. Failures are now reported as failures.
 *
 * 2. It only ever asked for the weather *now*, at places the rider reaches hours
 *    later. Each checkpoint can now carry the time the rider expects to be there.
 */

const MET_API = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';

/** MET.no publishes roughly hourly and asks callers not to re-fetch sooner. */
const forecastCache = new TtlCache<MetTimeseriesEntry[]>(30 * 60 * 1000, 400);

/** MET.no locationforecast reaches about nine days ahead. */
const MAX_FORECAST_DAYS = 9;

/** Beyond this gap we stop pretending the entry describes the requested hour. */
const APPROXIMATE_THRESHOLD_MS = 3 * 60 * 60 * 1000;

interface MetTimeseriesEntry {
  time: string;
  data?: {
    instant?: { details?: Record<string, number> };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: Record<string, number> };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: Record<string, number> };
  };
}

interface MetResponse {
  properties?: { timeseries?: MetTimeseriesEntry[] };
}

interface RequestedPoint {
  lat: number;
  lng: number;
  label?: string;
  /** ISO timestamp for when the rider expects to be here. */
  time?: string;
}

export type RidingCondition = 'good' | 'fair' | 'poor';

export interface Forecast {
  /** The forecast hour actually used, which may differ from the one requested. */
  time: string;
  requestedTime: string;
  /** True when the nearest available entry was more than three hours off. */
  approximate: boolean;
  tempC: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  precipitationMm: number | null;
  symbolCode: string | null;
  condition: RidingCondition;
  conditionLabel: string;
}

/**
 * A rough read on riding conditions, derived from the MET numbers above.
 * Kept deliberately blunt: it flags the three things that actually spoil or
 * endanger a ride — cold, rain and gusts — and never claims more than that.
 */
function assessRiding(
  tempC: number | null,
  precipitationMm: number | null,
  windGustMs: number | null
): { condition: RidingCondition; conditionLabel: string } {
  const temp = tempC ?? 15;
  const rain = precipitationMm ?? 0;
  const gust = windGustMs ?? 0;

  if (temp <= 2 || rain >= 2 || gust >= 15) {
    const reason = temp <= 2 ? 'fare for is' : rain >= 2 ? 'mye nedbør' : 'sterke vindkast';
    return { condition: 'poor', conditionLabel: `Krevende – ${reason}` };
  }

  if (temp <= 7 || rain >= 0.2 || gust >= 10) {
    const reason = temp <= 7 ? 'kaldt' : rain >= 0.2 ? 'nedbør' : 'vindkast';
    return { condition: 'fair', conditionLabel: `Brukbart – ${reason}` };
  }

  return { condition: 'good', conditionLabel: 'Gode forhold' };
}

async function loadTimeseries(lat: number, lng: number): Promise<MetTimeseriesEntry[]> {
  // MET.no explicitly asks callers to truncate coordinates to four decimals so
  // their cache is effective.
  const roundedLat = lat.toFixed(4);
  const roundedLng = lng.toFixed(4);

  return forecastCache.wrap(`${roundedLat},${roundedLng}`, async () => {
    const data = await fetchJson<MetResponse>(
      'MET.no',
      `${MET_API}?lat=${roundedLat}&lon=${roundedLng}`
    );

    const timeseries = data.properties?.timeseries;
    if (!Array.isArray(timeseries) || timeseries.length === 0) {
      throw new UpstreamError('MET.no', 'MET.no returnerte ingen varseldata');
    }
    return timeseries;
  });
}

function buildForecast(timeseries: MetTimeseriesEntry[], requestedAt: Date): Forecast | null {
  let nearest: MetTimeseriesEntry | null = null;
  let nearestGap = Infinity;

  for (const entry of timeseries) {
    const gap = Math.abs(new Date(entry.time).getTime() - requestedAt.getTime());
    if (gap < nearestGap) {
      nearestGap = gap;
      nearest = entry;
    }
  }

  if (!nearest) return null;

  const instant = nearest.data?.instant?.details ?? {};
  const nextHour = nearest.data?.next_1_hours;
  const nextSixHours = nearest.data?.next_6_hours;

  const tempC = numberOrNull(instant.air_temperature);
  const windSpeedMs = numberOrNull(instant.wind_speed);
  const windGustMs = numberOrNull(instant.wind_speed_of_gust);
  const precipitationMm = numberOrNull(
    nextHour?.details?.precipitation_amount ?? nextSixHours?.details?.precipitation_amount
  );

  const { condition, conditionLabel } = assessRiding(tempC, precipitationMm, windGustMs);

  return {
    time: nearest.time,
    requestedTime: requestedAt.toISOString(),
    approximate: nearestGap > APPROXIMATE_THRESHOLD_MS,
    tempC: tempC === null ? null : Math.round(tempC),
    windSpeedMs: windSpeedMs === null ? null : round1(windSpeedMs),
    windGustMs: windGustMs === null ? null : round1(windGustMs),
    precipitationMm: precipitationMm === null ? null : round1(precipitationMm),
    symbolCode: nextHour?.summary?.symbol_code ?? nextSixHours?.summary?.symbol_code ?? null,
    condition,
    conditionLabel,
  };
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Fetches forecasts for the requested checkpoints. Host-neutral. */
export async function handleWeatherRequest(payload: unknown): Promise<ApiResult> {
  const { points } = (payload ?? {}) as { points?: RequestedPoint[] };

  if (!Array.isArray(points) || points.length === 0) {
    return badRequest('Ingen koordinater oppgitt for værvarsel.');
  }

  if (points.length > 12) {
    return badRequest('For mange værpunkter i én forespørsel (maks 12).');
  }

  const now = Date.now();
  const horizon = now + MAX_FORECAST_DAYS * 24 * 60 * 60 * 1000;

  const weather = await Promise.all(
    points.map(async (point) => {
      const base = {
        lat: point.lat,
        lng: point.lng,
        locationName: point.label || 'Værpunkt',
      };

      if (!isValidCoord(point.lat, point.lng)) {
        return { ...base, forecast: null, error: 'Ugyldige koordinater.' };
      }

      const requestedAt = point.time ? new Date(point.time) : new Date();
      if (Number.isNaN(requestedAt.getTime())) {
        return { ...base, forecast: null, error: 'Ugyldig tidspunkt.' };
      }

      if (requestedAt.getTime() > horizon) {
        return {
          ...base,
          forecast: null,
          error: `Værvarsel finnes bare omtrent ${MAX_FORECAST_DAYS} dager fram i tid.`,
        };
      }

      try {
        const timeseries = await loadTimeseries(point.lat, point.lng);
        return { ...base, forecast: buildForecast(timeseries, requestedAt), error: null };
      } catch (err) {
        const message =
          err instanceof UpstreamError ? err.message : 'Kunne ikke hente værvarsel for punktet.';
        console.warn(`[weather] ${point.lat},${point.lng}: ${message}`);
        // Explicitly no invented numbers here. The UI shows this as unavailable.
        return { ...base, forecast: null, error: message };
      }
    })
  );

  return { status: 200, body: { weather, source: 'MET.no Locationforecast 2.0' } };
}
