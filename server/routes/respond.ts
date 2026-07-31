import type { Response } from 'express';
import type { ApiResult } from '../handlers/apiResult.js';

/** Adapter from the host-neutral handler result to an Express response. */
export function send(res: Response, result: ApiResult): void {
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    res.setHeader(name, value);
  }
  res.status(result.status).json(result.body);
}
