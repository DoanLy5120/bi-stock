import path from 'node:path';

import express from 'express';

import { config } from './config.js';
import { createDb, getPool, sql } from './db.js';
import { errorHandler } from './errors.js';
import { createStockRouter } from './routes/stock.js';
import { createCacheService } from './services/cache.js';
import { createDatasetService } from './services/dataset.js';
import { createQueryService } from './services/query.js';
import { makeDb } from './mock-db.js';

export const logger = {
  info: (...args) => console.log('[stock]', ...args),
  warn: (...args) => console.warn('[stock]', ...args),
  error: (...args) => console.error('[stock]', ...args),
};

const db = config.useMockData ? makeDb() : createDb();
const dataset = createDatasetService({ db, logger });
const cache = createCacheService({ db, dataset, config, logger });
const query = createQueryService({ dataset, cache, config });

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  req.log = logger;
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/stock', createStockRouter({ query }));

app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route' } });
});

if (config.serveStatic) {
  const dist = path.resolve(process.cwd(), config.clientDist);
  app.use(express.static(dist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use(errorHandler);

const server = app.listen(config.port, config.host, () => {
  logger.info(`Stock API listening on http://${config.host}:${config.port}/api/stock`);
});

const shutdown = async (signal) => {
  logger.info(`${signal} received, closing the pool`);
  server.close();
  if (!config.useMockData) {
    try {
      const pool = await getPool();
      await pool.close();
    } catch {
      /* the process is going away anyway */
    }
  }
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason instanceof Error ? reason.stack : reason);
});

export { app, db, dataset, cache, query, sql };
