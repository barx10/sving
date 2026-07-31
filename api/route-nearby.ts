import { handleNearbyRouteRequest } from '../server/handlers/route.js';
import { toResponse } from '../server/handlers/apiResult.js';

// Up to 4 round_trip attempts at 6 s each, since ORS's own randomised algorithm
// genuinely fails about half the time in constrained road networks — this
// budget matches the 30 s already proven safe on /api/route.
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null);
  return toResponse(await handleNearbyRouteRequest(payload));
}
