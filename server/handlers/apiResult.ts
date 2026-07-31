/**
 * The API logic is written once and served from two very different hosts: the
 * Express server (local dev and any future VPS) and Vercel serverless functions
 * (the current public hosting). Handlers therefore return this neutral shape
 * instead of touching a response object, and each host adapts it.
 */

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export function badRequest(message: string): ApiResult<{ error: string }> {
  return { status: 400, body: { error: message } };
}

/** Adapter for Vercel's web-standard function signature. */
export function toResponse(result: ApiResult): Response {
  return Response.json(result.body, { status: result.status, headers: result.headers });
}
