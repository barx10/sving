import { handleGeocodeReverse } from '../../server/handlers/geocode';
import { toResponse } from '../../server/handlers/apiResult';

export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return toResponse(await handleGeocodeReverse(params.get('lat'), params.get('lng')));
}
