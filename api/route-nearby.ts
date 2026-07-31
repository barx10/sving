import { handleNearbyRouteRequest } from '../server/handlers/route.js';
import { toResponse } from '../server/handlers/apiResult.js';

// A single ORS round_trip call with embedded elevation — no OSRM fallback chain,
// so this needs less headroom than /api/route, but still more than the default.
export const maxDuration = 15;

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null);
  return toResponse(await handleNearbyRouteRequest(payload));
}
