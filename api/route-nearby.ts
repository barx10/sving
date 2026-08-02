import { handleNearbyRouteRequest } from '../server/handlers/route.js';
import { toResponse } from '../server/handlers/apiResult.js';

// Up to 4 round_trip attempts at 10 s each, since ORS's own randomised
// algorithm genuinely fails about half the time in constrained road networks.
// The budget has to cover all four, or the last attempts are cut off by the
// host rather than by anything we decided.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null);
  return toResponse(await handleNearbyRouteRequest(payload));
}
