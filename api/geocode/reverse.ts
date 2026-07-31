import { handleGeocodeReverse } from '../../server/handlers/geocode.js';
import { toResponse } from '../../server/handlers/apiResult.js';

export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return toResponse(await handleGeocodeReverse(params.get('lat'), params.get('lng')));
}
