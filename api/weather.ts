import { handleWeatherRequest } from '../server/handlers/weather';
import { toResponse } from '../server/handlers/apiResult';

// Up to twelve MET.no lookups per request on a cold instance.
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null);
  return toResponse(await handleWeatherRequest(payload));
}
