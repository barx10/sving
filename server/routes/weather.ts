import { Router, type Request, type Response } from 'express';
import { handleWeatherRequest } from '../handlers/weather';
import { send } from './respond';

export const weatherRouter = Router();

weatherRouter.post('/', async (req: Request, res: Response) => {
  send(res, await handleWeatherRequest(req.body));
});
