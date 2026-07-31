import { handleGeocodeSearch } from '../../server/handlers/geocode.js';
import { toResponse } from '../../server/handlers/apiResult.js';

export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q');
  return toResponse(await handleGeocodeSearch(query));
}
