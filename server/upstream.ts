import { USER_AGENT } from './config';

/** Nothing upstream is allowed to hang a request forever. */
const DEFAULT_TIMEOUT_MS = 10_000;

export class UpstreamError extends Error {
  constructor(
    readonly service: string,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * Serialises calls to an upstream and keeps a minimum gap between them.
 * Nominatim's usage policy caps everyone at one request per second in absolute
 * terms, which per-IP rate limiting cannot enforce on its own.
 */
export function createThrottle(minIntervalMs: number) {
  let lastRunAt = 0;
  let chain: Promise<unknown> = Promise.resolve();

  return function throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = lastRunAt + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRunAt = Date.now();
      return task();
    };

    const result = chain.then(run, run);
    chain = result.catch(() => undefined);
    return result;
  };
}

interface FetchJsonOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Fetches JSON from a public API with a timeout and an identifying User-Agent.
 * Throws UpstreamError so callers can tell "the service said no" apart from a bug.
 */
export async function fetchJson<T>(
  service: string,
  url: string,
  { method = 'GET', body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS }: FetchJsonOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new UpstreamError(service, `${service} svarte ${response.status}`, response.status);
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new UpstreamError(service, `${service} svarte ikke innen ${timeoutMs / 1000} sekunder`);
    }
    throw new UpstreamError(service, `${service} er ikke tilgjengelig`);
  } finally {
    clearTimeout(timer);
  }
}
