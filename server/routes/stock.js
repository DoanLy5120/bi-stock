import { Router } from 'express';

import { asyncRoute, badRequest } from '../errors.js';

export const createStockRouter = ({ query }) => {
  const router = Router();

  router.get(
    '/overview',
    asyncRoute(async (req, res) => {
      res.json(await query.overview());
    }),
  );

  router.get(
    '/detail',
    asyncRoute(async (req, res) => {
      const filter = query.normalizeDetailQuery(req.query);
      res.json(await query.detail(filter));
    }),
  );

  router.get(
    '/reserve',
    asyncRoute(async (req, res) => {
      res.json(await query.reserve());
    }),
  );

  router.get(
    '/wip',
    asyncRoute(async (req, res) => {
      res.json(await query.wip());
    }),
  );

  router.get(
    '/source/status',
    asyncRoute(async (req, res) => {
      res.json(await query.sourceStatus());
    }),
  );

  router.post(
    '/cache/refresh',
    asyncRoute(async (req, res) => {
      const body = req.body ?? {};
      if (body.keys !== undefined && body.keys !== null && !Array.isArray(body.keys)) {
        throw badRequest('keys must be an array of dataset keys');
      }
      res.json(await query.refreshCache(body.keys));
    }),
  );

  router.put(
    '/wip/lots/:id/tag',
    asyncRoute(async (req, res) => {
      const body = req.body ?? {};
      res.json(
        await query.updateTag({
          lotId: req.params.id,
          cause: body.cause,
          blueFlag: body.blueFlag,
        }),
      );
    }),
  );

  return router;
};
