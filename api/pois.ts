import { handlePoisRequest } from '../server/handlers/pois.js';
import { toResponse } from '../server/handlers/apiResult.js';

// Room for two Overpass instances at 28 seconds each: the public one answers a
// good query with 504 when it is loaded, and the failover is worthless if the
// function is killed before it can finish.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null);
  return toResponse(await handlePoisRequest(payload));
}
