import { handleHazardsRequest } from '../server/handlers/hazards';
import { toResponse } from '../server/handlers/apiResult';

export function GET(): Response {
  return toResponse(handleHazardsRequest());
}
