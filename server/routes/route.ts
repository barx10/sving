import { Router, type Request, type Response } from 'express';
import { handleRouteRequest } from '../handlers/route.js';
import { send } from './respond.js';

export const routeRouter = Router();

routeRouter.post('/', async (req: Request, res: Response) => {
  send(res, await handleRouteRequest(req.body));
});
