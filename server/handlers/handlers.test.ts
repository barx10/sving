import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleNearbyRouteRequest, handleRouteRequest } from './route.js';
import { handleWeatherRequest } from './weather.js';
import { handleHazardsRequest } from './hazards.js';
import { handleGeocodeReverse, handleGeocodeSearch } from './geocode.js';
import { toResponse } from './apiResult.js';

/**
 * The handlers are the single API surface served by both Express and the
 * Vercel functions, so their validation runs here without any network: every
 * test exercises a path that must reject before an upstream call is made.
 */

describe('handleRouteRequest validation', () => {
  it('rejects a missing body', async () => {
    const result = await handleRouteRequest(null);
    expect(result.status).toBe(400);
  });

  it('rejects fewer than two coordinates', async () => {
    const result = await handleRouteRequest({ coordinates: [[7.6, 62.5]] });
    expect(result.status).toBe(400);
  });

  it('rejects too many waypoints', async () => {
    const coordinates = Array.from({ length: 13 }, (_, i) => [7 + i * 0.1, 62]);
    const result = await handleRouteRequest({ coordinates });
    expect(result.status).toBe(400);
  });

  it('rejects out-of-range coordinates', async () => {
    const result = await handleRouteRequest({
      coordinates: [
        [7.6, 62.5],
        [999, 999],
      ],
    });
    expect(result.status).toBe(400);
  });
});

describe('handleNearbyRouteRequest validation', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('rejects a missing body', async () => {
    expect((await handleNearbyRouteRequest(null)).status).toBe(400);
  });

  it('rejects an invalid position', async () => {
    const result = await handleNearbyRouteRequest({ lat: 999, lng: 999, radiusKm: 40 });
    expect(result.status).toBe(400);
  });

  it('rejects a missing radius', async () => {
    const result = await handleNearbyRouteRequest({ lat: 62.5, lng: 7.6 });
    expect(result.status).toBe(400);
  });

  it('rejects a radius below the minimum', async () => {
    const result = await handleNearbyRouteRequest({ lat: 62.5, lng: 7.6, radiusKm: 5 });
    expect(result.status).toBe(400);
  });

  it('rejects a radius above the maximum', async () => {
    const result = await handleNearbyRouteRequest({ lat: 62.5, lng: 7.6, radiusKm: 200 });
    expect(result.status).toBe(400);
  });

  it('reports the feature as unavailable without a configured ORS key, rather than falling back silently', async () => {
    // Unlike point-to-point routing, there is no OSRM equivalent for round trips
    // to fall back to — validation must not be the only thing standing between
    // a well-formed request and a network call that was always going to fail.
    vi.resetModules();
    const previous = process.env.OPENROUTESERVICE_API_KEY;
    process.env.OPENROUTESERVICE_API_KEY = '';
    try {
      const { handleNearbyRouteRequest: handleWithoutKey } = await import('./route.js');
      const result = await handleWithoutKey({ lat: 62.5, lng: 7.6, radiusKm: 40 });
      expect(result.status).toBe(503);
    } finally {
      process.env.OPENROUTESERVICE_API_KEY = previous;
    }
  });
});

describe('handleWeatherRequest validation', () => {
  it('rejects a missing body', async () => {
    expect((await handleWeatherRequest(null)).status).toBe(400);
  });

  it('rejects an empty point list', async () => {
    expect((await handleWeatherRequest({ points: [] })).status).toBe(400);
  });

  it('rejects more than twelve points', async () => {
    const points = Array.from({ length: 13 }, () => ({ lat: 62, lng: 7 }));
    expect((await handleWeatherRequest({ points })).status).toBe(400);
  });
});

describe('handleGeocode validation', () => {
  it('rejects a one-character search', async () => {
    expect((await handleGeocodeSearch('a')).status).toBe(400);
  });

  it('rejects a missing query', async () => {
    expect((await handleGeocodeSearch(null)).status).toBe(400);
  });

  it('rejects unparseable reverse coordinates', async () => {
    expect((await handleGeocodeReverse('abc', '7')).status).toBe(400);
    expect((await handleGeocodeReverse(null, null)).status).toBe(400);
  });
});

describe('handleHazardsRequest', () => {
  it('reports seasonal provenance, never live data', () => {
    const result = handleHazardsRequest(new Date('2026-01-15'));
    expect(result.status).toBe(200);

    const body = result.body as {
      passes: { status: string }[];
      dataSource: string;
      disclaimer: string;
      verifyUrl: string;
    };
    expect(body.dataSource).toBe('curated-seasonal');
    expect(body.disclaimer).toContain('ikke fra sanntidsdata');
    expect(body.verifyUrl).toContain('vegvesen.no');
    // In January the summer passes must not be reported open.
    expect(body.passes.some((p) => p.status === 'closed_seasonal')).toBe(true);
  });

  it('is edge-cacheable', () => {
    expect(handleHazardsRequest().headers?.['Cache-Control']).toContain('s-maxage');
  });
});

describe('toResponse', () => {
  it('carries status, body and headers into a web Response', async () => {
    const response = toResponse({
      status: 418,
      body: { hello: 'there' },
      headers: { 'X-Test': 'yes' },
    });
    expect(response.status).toBe(418);
    expect(response.headers.get('X-Test')).toBe('yes');
    expect(await response.json()).toEqual({ hello: 'there' });
  });
});
