import { handlePoisRequest } from '../server/handlers/pois.js';
import { toResponse } from '../server/handlers/apiResult.js';

// One Overpass query, which is allowed 25 seconds of its own before we give up.
export const maxDuration = 40;

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null);
  return toResponse(await handlePoisRequest(payload));
}
