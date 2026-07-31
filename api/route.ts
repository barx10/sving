import { handleRouteRequest } from '../server/handlers/route.js';
import { toResponse } from '../server/handlers/apiResult.js';

// Route calculation can chain ORS -> OSRM -> two elevation providers, each
// with its own timeout, so this needs more than Vercel's 10 s default.
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null);
  return toResponse(await handleRouteRequest(payload));
}
