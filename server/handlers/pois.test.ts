import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointOfInterest } from './pois.js';
import { handlePoisRequest } from './pois.js';

/**
 * The Overpass call itself is stubbed. Everything around it — the cache, the
 * in-flight sharing, the tag mapping — is what keeps this app from leaning on a
 * shared public service, so that part is exercised for real.
 */
const fetchJson = vi.hoisted(() => vi.fn());

vi.mock('../upstream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../upstream.js')>()),
  fetchJson,
  // The real throttle spaces Overpass calls 1.5 seconds apart. Waiting that out
  // here would add nine seconds to the suite without testing anything this
  // handler owns.
  createThrottle: () => <T>(task: () => Promise<T>) => task(),
}));

/**
 * Every case here must be rejected before Overpass is called at all. Overpass
 * is a shared public service that answers a busy caller with 429 rather than a
 * queue, so validation that leaks through does not merely waste a request — it
 * spends this app's slot allowance on garbage.
 */

const validPoint: [number, number] = [62.45, 7.67];

describe('handlePoisRequest validation', () => {
  it('rejects a missing body', async () => {
    expect((await handlePoisRequest(null)).status).toBe(400);
  });

  it('rejects a single point, which describes no corridor', async () => {
    expect((await handlePoisRequest({ points: [validPoint] })).status).toBe(400);
  });

  it('rejects more points than the corridor search accepts', async () => {
    const points = Array.from({ length: 81 }, (_, i) => [62 + i * 0.01, 7.6]);
    expect((await handlePoisRequest({ points })).status).toBe(400);
  });

  it('rejects a malformed point', async () => {
    const result = await handlePoisRequest({ points: [validPoint, [62.5]] });
    expect(result.status).toBe(400);
  });

  it('rejects a point that is not a pair of numbers', async () => {
    const result = await handlePoisRequest({ points: [validPoint, ['62.5', '7.6']] });
    expect(result.status).toBe(400);
  });

  it('rejects out-of-range coordinates', async () => {
    const result = await handlePoisRequest({ points: [validPoint, [999, 999]] });
    expect(result.status).toBe(400);
  });

  it('rejects coordinates outside the Nordics', async () => {
    // Sydney. Valid, but not something this app should proxy Overpass for.
    const result = await handlePoisRequest({ points: [[-33.86, 151.2], [-33.87, 151.21]] });

    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toMatch(/Norden/);
  });

  it('never reaches Overpass for any of the above', () => {
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

const poisIn = (result: { body: unknown }): PointOfInterest[] =>
  (result.body as { pois: PointOfInterest[] }).pois;

/** Each block uses its own coordinates: the cache is module-level, like in production. */
describe('handlePoisRequest against Overpass', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  it('answers a repeated route from cache instead of asking again', async () => {
    fetchJson.mockResolvedValue({ elements: [] });
    const points = [
      [62.1, 7.1],
      [62.2, 7.2],
    ];

    expect((await handlePoisRequest({ points })).status).toBe(200);
    expect((await handlePoisRequest({ points })).status).toBe(200);

    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('rounds the cache key, so near-identical routes share one lookup', async () => {
    fetchJson.mockResolvedValue({ elements: [] });

    await handlePoisRequest({ points: [[62.301, 7.301], [62.401, 7.401]] });
    await handlePoisRequest({ points: [[62.3013, 7.3009], [62.4008, 7.4012]] });

    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('shares one lookup between callers who arrive together', async () => {
    fetchJson.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ elements: [] }), 20))
    );
    const points = [
      [62.5, 7.5],
      [62.6, 7.6],
    ];

    const results = await Promise.all([
      handlePoisRequest({ points }),
      handlePoisRequest({ points }),
      handlePoisRequest({ points }),
    ]);

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('maps OSM tags to what a rider needs, and collapses duplicates', async () => {
    fetchJson.mockResolvedValue({
      elements: [
        {
          type: 'node',
          id: 1,
          lat: 62.7,
          lon: 7.7,
          tags: { amenity: 'fuel', brand: 'Circle K', opening_hours: '24/7' },
        },
        // The same forecourt again as a way, which OSM routinely holds twice.
        {
          type: 'way',
          id: 2,
          center: { lat: 62.70004, lon: 7.70004 },
          tags: { amenity: 'fuel', brand: 'Circle K' },
        },
        {
          type: 'node',
          id: 3,
          lat: 62.75,
          lon: 7.75,
          tags: { highway: 'rest_area', 'description:no': 'Hovedrasteplass', toilets: 'yes' },
        },
        // No coordinates at all: nothing to put on a map.
        { type: 'way', id: 4, tags: { amenity: 'fuel' } },
      ],
    });

    const pois = poisIn(
      await handlePoisRequest({
        points: [
          [62.7, 7.7],
          [62.8, 7.8],
        ],
      })
    );

    expect(pois).toHaveLength(2);

    const [fuel, rest] = pois;
    expect(fuel).toMatchObject({ category: 'fuel', name: 'Circle K', openingHours: '24/7' });
    expect(rest).toMatchObject({
      category: 'rest_area',
      name: 'Hovedrasteplass',
      hasToilets: true,
    });
  });

  it('reports a busy Overpass as something to retry, not as an empty result', async () => {
    const { UpstreamError } = await import('../upstream.js');
    fetchJson.mockRejectedValue(new UpstreamError('Overpass', 'Overpass svarte 429', 429));

    const result = await handlePoisRequest({
      points: [
        [63.1, 8.1],
        [63.2, 8.2],
      ],
    });

    expect(result.status).toBe(503);
    expect(result.headers?.['Retry-After']).toBe('60');
  });

  it('does not cache a failure, so a retry can actually retry', async () => {
    const { UpstreamError } = await import('../upstream.js');
    fetchJson.mockRejectedValue(new UpstreamError('Overpass', 'Overpass svarte 504', 504));
    const points = [
      [63.3, 8.3],
      [63.4, 8.4],
    ];

    expect((await handlePoisRequest({ points })).status).toBe(502);

    fetchJson.mockReset();
    fetchJson.mockResolvedValue({ elements: [] });
    expect((await handlePoisRequest({ points })).status).toBe(200);
  });
});

/**
 * Seen in production: overpass-api.de under load answered a perfectly good
 * query with 504, and the identical query succeeded a minute later. Asking a
 * second instance costs nothing until the first has already failed.
 */
describe('handlePoisRequest across Overpass instances', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  const urlsAsked = () => fetchJson.mock.calls.map((call) => String(call[1]).split('?')[0]);

  /**
   * Measured against overpass-api.de with the identical corridor query, three
   * times in a row: 200 in 10.1 s, then 504 after 9.2 s, then 200 in 17.8 s. A
   * 504 that arrives well inside the instance's own 25-second budget is load
   * shedding, not a verdict on the query — so the primary is asked again before
   * we go looking elsewhere.
   */
  it('asks the same instance again when it sheds load', async () => {
    const { UpstreamError } = await import('../upstream.js');
    fetchJson
      .mockRejectedValueOnce(new UpstreamError('Overpass', 'Overpass svarte 504', 504))
      .mockResolvedValueOnce({
        elements: [{ type: 'node', id: 9, lat: 64.1, lon: 9.1, tags: { amenity: 'fuel' } }],
      });

    const result = await handlePoisRequest({
      points: [
        [64.1, 9.1],
        [64.2, 9.2],
      ],
    });

    expect(result.status).toBe(200);
    expect(poisIn(result)).toHaveLength(1);

    const asked = urlsAsked();
    expect(asked).toHaveLength(2);
    expect(asked[0]).toBe(asked[1]);
  });

  it('moves on to a mirror once the primary has had its two goes', async () => {
    const { UpstreamError } = await import('../upstream.js');
    fetchJson
      .mockRejectedValueOnce(new UpstreamError('Overpass', 'Overpass svarte 504', 504))
      .mockRejectedValueOnce(new UpstreamError('Overpass', 'Overpass svarte 504', 504))
      .mockResolvedValueOnce({ elements: [] });

    expect((await handlePoisRequest({ points: [[64.15, 9.15], [64.25, 9.25]] })).status).toBe(200);

    const asked = urlsAsked();
    expect(asked).toHaveLength(3);
    expect(new Set(asked).size).toBe(2);
  });

  it('asks again when the first attempt has no slot left for us', async () => {
    const { UpstreamError } = await import('../upstream.js');
    fetchJson
      .mockRejectedValueOnce(new UpstreamError('Overpass', 'Overpass svarte 429', 429))
      .mockResolvedValueOnce({ elements: [] });

    expect((await handlePoisRequest({ points: [[64.3, 9.3], [64.4, 9.4]] })).status).toBe(200);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  /** A rejected query is rejected everywhere; shopping it around is just load. */
  it('does not shop a bad query around, however many attempts are left', async () => {
    const { UpstreamError } = await import('../upstream.js');
    fetchJson.mockRejectedValue(new UpstreamError('Overpass', 'Overpass svarte 400', 400));

    expect((await handlePoisRequest({ points: [[64.5, 9.5], [64.6, 9.6]] })).status).toBe(502);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('reports the failure once every instance has been asked', async () => {
    const { UpstreamError } = await import('../upstream.js');
    fetchJson.mockRejectedValue(new UpstreamError('Overpass', 'Overpass svarte 429', 429));

    const result = await handlePoisRequest({ points: [[64.7, 9.7], [64.8, 9.8]] });

    expect(result.status).toBe(503);
    expect(fetchJson.mock.calls.length).toBeGreaterThan(1);
  });
});
