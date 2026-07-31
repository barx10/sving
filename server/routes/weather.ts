import { Router, type Request, type Response } from 'express';
import { handleWeatherRequest } from '../handlers/weather.js';
import { send } from './respond.js';

export const weatherRouter = Router();

weatherRouter.post('/', async (req: Request, res: Response) => {
  send(res, await handleWeatherRequest(req.body));
});
