import { Router, type Request, type Response } from 'express';
import { handlePoisRequest } from '../handlers/pois.js';
import { send } from './respond.js';

export const poisRouter = Router();

poisRouter.post('/', async (req: Request, res: Response) => {
  send(res, await handlePoisRequest(req.body));
});
