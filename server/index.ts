import 'dotenv/config';

import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { IS_PRODUCTION, PORT, TRUST_PROXY, warnAboutMissingConfig } from './config.js';
import { handleHealthRequest } from './handlers/health.js';
import { rateLimit } from './rateLimit.js';
import { send } from './routes/respond.js';
import { geocodeRouter } from './routes/geocode.js';
import { hazardsRouter } from './routes/hazards.js';
import { routeRouter } from './routes/route.js';
import { routeNearbyRouter } from './routes/routeNearby.js';
import { weatherRouter } from './routes/weather.js';

const app = express();

if (TRUST_PROXY) {
  // Required for per-IP rate limiting to see the real client behind a proxy.
  app.set('trust proxy', Number(TRUST_PROXY) || TRUST_PROXY);
}

app.disable('x-powered-by');

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Routes are capped at a dozen waypoints, so no legitimate request is large.
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  send(res, handleHealthRequest());
});

/**
 * Every /api call fans out to a free public service. Without a cap, one
 * misbehaving client can get this server's IP banned from OSRM or Nominatim
 * for every rider using the app.
 */
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    max: 60,
    message: 'For mange forespørsler fra denne enheten. Vent et minutt og prøv igjen.',
  })
);

app.use('/api/route', routeRouter);
app.use('/api/route-nearby', routeNearbyRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/hazards', hazardsRouter);
app.use('/api/geocode', geocodeRouter);

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Ukjent API-endepunkt.' });
});

app.use('/api', (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'Uventet serverfeil.' });
});

async function startServer(): Promise<void> {
  warnAboutMissingConfig();

  if (IS_PRODUCTION) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { maxAge: '1h', index: false }));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏍️  Sving kjører på http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Kunne ikke starte serveren:', err);
  process.exit(1);
});
