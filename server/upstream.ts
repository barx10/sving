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
    readonly detail?: string
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** Enough of an error body to identify the problem, never enough to fill a log. */
const MAX_DETAIL_CHARS = 300;

/**
 * The failing response's own explanation. ORS in particular answers a failed
 * round_trip with a bare 500 whose body carries the actual reason — without
 * this, every such failure looks identical in the logs and the next one has to
 * be diagnosed by guesswork all over again.
 */
async function errorDetail(response: Response): Promise<string | undefined> {
  try {
    const text = (await response.text()).trim();
    if (!text) return undefined;

    try {
      const parsed = JSON.parse(text) as { error?: { message?: string; code?: number } | string };
      const error = parsed.error;
      if (typeof error === 'string') return error.slice(0, MAX_DETAIL_CHARS);
      if (error?.message) {
        const code = error.code === undefined ? '' : ` (kode ${error.code})`;
        return `${error.message}${code}`.slice(0, MAX_DETAIL_CHARS);
      }
    } catch {
      // Not JSON — the raw text is still better than nothing.
    }

    return text.slice(0, MAX_DETAIL_CHARS);
  } catch {
    return undefined;
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
      throw new UpstreamError(
        service,
        `${service} svarte ${response.status}`,
        response.status,
        await errorDetail(response)
      );
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
