import { Router, type Request, type Response } from 'express';
import { handleHazardsRequest } from '../handlers/hazards';
import { send } from './respond';

export const hazardsRouter = Router();

hazardsRouter.get('/', (_req: Request, res: Response) => {
  send(res, handleHazardsRequest());
});
