import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * config.ts reads the environment once at module load, so each case has to load
 * it fresh. That is also what makes the endpoint worth testing: the booleans are
 * decided at cold start, which is exactly when a missing variable goes unnoticed.
 */
async function healthWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  const previous = { ...process.env };
  Object.assign(process.env, env);
  try {
    const { handleHealthRequest } = await import('./health.js');
    return handleHealthRequest();
  } finally {
    process.env = previous;
  }
}

afterEach(() => {
  vi.resetModules();
});

describe('handleHealthRequest', () => {
  it('reports both settings as configured when they are present', async () => {
    const result = await healthWith({
      CONTACT_EMAIL: 'someone@example.com',
      OPENROUTESERVICE_API_KEY: 'key',
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, contact: true, routingKey: true });
  });

  it('reports them as missing when unset', async () => {
    const result = await healthWith({
      CONTACT_EMAIL: undefined,
      OPENROUTESERVICE_API_KEY: undefined,
    });

    expect(result.body).toEqual({ ok: true, contact: false, routingKey: false });
  });

  it('treats an empty string as missing rather than configured', async () => {
    const result = await healthWith({ CONTACT_EMAIL: '', OPENROUTESERVICE_API_KEY: '' });

    expect(result.body).toEqual({ ok: true, contact: false, routingKey: false });
  });

  it('never exposes the configured values themselves', async () => {
    const result = await healthWith({
      CONTACT_EMAIL: 'secret@example.com',
      OPENROUTESERVICE_API_KEY: 'super-secret-key',
    });

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('secret@example.com');
    expect(serialised).not.toContain('super-secret-key');
  });
});
