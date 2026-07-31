/**
 * Vercel serverless entry points live in api/ — each file becomes one function
 * with the same path, so this repo serves the exact same /api surface whether
 * it runs as the Express server (dev, VPS) or on Vercel. The logic lives in
 * server/handlers/, shared by both hosts.
 */
export function GET(): Response {
  return Response.json({ ok: true });
}
