import { Router, type Request, type Response } from 'express';
import { handleHazardsRequest } from '../handlers/hazards.js';
import { send } from './respond.js';

export const hazardsRouter = Router();

hazardsRouter.get('/', (_req: Request, res: Response) => {
  send(res, handleHazardsRequest());
});
