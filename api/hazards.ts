import { handleHazardsRequest } from '../server/handlers/hazards.js';
import { toResponse } from '../server/handlers/apiResult.js';

export function GET(): Response {
  return toResponse(handleHazardsRequest());
}
