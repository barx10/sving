import type { NextFunction, Request, Response } from 'express';

/**
 * Fixed-window rate limiter, per client IP.
 *
 * This protects the upstreams more than it protects us: every /api call fans out
 * to a free public service, and a single misbehaving client can get this app's
 * server IP banned from OSRM or Nominatim for everyone using it.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

export function rateLimit({ windowMs, max, message }: RateLimitOptions) {
  const clients = new Map<string, Window>();

  // Drop expired windows periodically so the map cannot grow without bound.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, window] of clients) {
      if (window.resetAt <= now) clients.delete(key);
    }
  }, windowMs);
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const window = clients.get(key);

    if (!window || window.resetAt <= now) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    window.count += 1;

    if (window.count > max) {
      const retryAfterSec = Math.ceil((window.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: message || 'For mange forespørsler. Vent litt og prøv igjen.',
      });
      return;
    }

    next();
  };
}
