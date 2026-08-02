import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamError, fetchJson } from './upstream.js';

/**
 * What a failing upstream said is the difference between a diagnosable incident
 * and another round of guesswork: ORS answers a failed round_trip with a bare
 * 500 whose body carries the only real explanation, and for a long time this
 * app threw that away and logged "svarte 500".
 */

function respondWith(status: number, body: string, ok = false): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, text: async () => body, json: async () => JSON.parse(body) }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const failing = async (): Promise<UpstreamError> => {
  const err = await fetchJson('OpenRouteService', 'https://example.test/route').catch(
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(UpstreamError);
  return err as UpstreamError;
};

describe('fetchJson error reporting', () => {
  it('keeps the status on the message and the service explanation beside it', async () => {
    respondWith(500, JSON.stringify({ error: { code: 2099, message: 'Unable to build a route' } }));

    const err = await failing();
    expect(err.status).toBe(500);
    expect(err.message).toBe('OpenRouteService svarte 500');
    expect(err.detail).toBe('Unable to build a route (kode 2099)');
  });

  it('handles a service that puts a plain string under error', async () => {
    respondWith(400, JSON.stringify({ error: 'Radius too large' }));
    expect((await failing()).detail).toBe('Radius too large');
  });

  it('falls back to the raw body when it is not the shape we know', async () => {
    respondWith(502, '<html>Bad gateway</html>');
    expect((await failing()).detail).toBe('<html>Bad gateway</html>');
  });

  it('reports no detail rather than an empty one', async () => {
    respondWith(503, '   ');
    expect((await failing()).detail).toBeUndefined();
  });

  it('truncates a body big enough to flood the logs', async () => {
    respondWith(500, 'x'.repeat(5000));
    expect((await failing()).detail).toHaveLength(300);
  });

  it('survives a body that cannot be read at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error('stream already consumed');
        },
      }))
    );

    const err = await failing();
    expect(err.status).toBe(500);
    expect(err.detail).toBeUndefined();
  });

  /** A timeout carries no status, which is how callers tell it apart. */
  it('reports a timeout without inventing a status for it', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn(async () => { throw abort; }));

    const err = await failing();
    expect(err.status).toBeUndefined();
    expect(err.message).toMatch(/svarte ikke innen/);
  });

  it('returns the parsed body when the service is happy', async () => {
    respondWith(200, JSON.stringify({ hello: 'world' }), true);
    await expect(fetchJson('OpenRouteService', 'https://example.test/route')).resolves.toEqual({
      hello: 'world',
    });
  });
});
