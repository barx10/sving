import { Router, type Request, type Response } from 'express';
import { handleGeocodeReverse, handleGeocodeSearch } from '../handlers/geocode';
import { send } from './respond';

export const geocodeRouter = Router();

geocodeRouter.get('/search', async (req: Request, res: Response) => {
  send(res, await handleGeocodeSearch(req.query.q));
});

geocodeRouter.get('/reverse', async (req: Request, res: Response) => {
  send(res, await handleGeocodeReverse(req.query.lat, req.query.lng));
});
