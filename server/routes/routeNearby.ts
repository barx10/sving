import { Router, type Request, type Response } from 'express';
import { handleNearbyRouteRequest } from '../handlers/route.js';
import { send } from './respond.js';

export const routeNearbyRouter = Router();

routeNearbyRouter.post('/', async (req: Request, res: Response) => {
  send(res, await handleNearbyRouteRequest(req.body));
});
