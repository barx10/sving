import { Router, type Request, type Response } from 'express';
import { handleRouteRequest } from '../handlers/route';
import { send } from './respond';

export const routeRouter = Router();

routeRouter.post('/', async (req: Request, res: Response) => {
  send(res, await handleRouteRequest(req.body));
});
