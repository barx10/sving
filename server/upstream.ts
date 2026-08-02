import { USER_AGENT } from './config.js';

/** Nothing upstream is allowed to hang a request forever. */
const DEFAULT_TIMEOUT_MS = 10_000;

export class UpstreamError extends Error {
  constructor(
    readonly service: string,
    message: string,
    readonly status?: number,
    /**
     * What the service itself said, when it bothered to say anything. Kept
     * separate from `message` because it is upstream prose in whatever language
     * and shape that service uses — fit for our logs, not for a rider's screen.
     */
    readonly detail?: string,
    /**
     * The service's own error code, kept as a value rather than left inside the
     * prose. HTTP status alone is too coarse to act on: ORS answers both "my
     * algorithm gave up, ask again" and "your coordinate is nowhere near a road"
     * with a 404, and only one of those is worth retrying.
     */
    readonly code?: number | string
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** Enough of an error body to identify the problem, never enough to fill a log. */
const MAX_DETAIL_CHARS = 300;

interface ErrorExplanation {
  detail?: string;
  code?: number | string;
}

/**
 * The failing response's own explanation. ORS in particular answers a failed
 * round_trip with a bare 500 whose body carries the actual reason — without
 * this, every such failure looks identical in the logs and the next one has to
 * be diagnosed by guesswork all over again.
 */
async function errorExplanation(response: Response): Promise<ErrorExplanation> {
  try {
    const text = (await response.text()).trim();
    if (!text) return {};

    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string; code?: number | string } | string;
      };
      const error = parsed.error;

      if (typeof error === 'string') return { detail: error.slice(0, MAX_DETAIL_CHARS) };

      if (error?.message) {
        const suffix = error.code === undefined ? '' : ` (kode ${error.code})`;
        return {
          detail: `${error.message}${suffix}`.slice(0, MAX_DETAIL_CHARS),
          code: error.code,
        };
      }
    } catch {
      // Not JSON — the raw text is still better than nothing.
    }

    return { detail: text.slice(0, MAX_DETAIL_CHARS) };
  } catch {
    return {};
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
      const { detail, code } = await errorExplanation(response);
      throw new UpstreamError(service, `${service} svarte ${response.status}`, response.status, detail, code);
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
