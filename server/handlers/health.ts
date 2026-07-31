import { HAS_CONTACT, HAS_ROUTING_KEY } from '../config.js';
import type { ApiResult } from './apiResult.js';

export interface HealthBody {
  ok: true;
  /** CONTACT_EMAIL is set, so outgoing requests identify an operator. */
  contact: boolean;
  /** OPENROUTESERVICE_API_KEY is set; routing falls back to public OSRM without it. */
  routingKey: boolean;
}

/**
 * Reports configuration presence, never configuration values. The booleans are
 * safe to expose: they say whether the operator finished setting the instance
 * up, which is already observable in how it behaves under load.
 */
export function handleHealthRequest(): ApiResult<HealthBody> {
  return {
    status: 200,
    body: { ok: true, contact: HAS_CONTACT, routingKey: HAS_ROUTING_KEY },
  };
}
