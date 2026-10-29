import 'dotenv/config';

import { clampInt } from './util/format.js';

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || String(value) === '1';
};

const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  port: number(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',

  db: {
    server: process.env.DB_SERVER || 'localhost',
    port: number(process.env.DB_PORT, 1433),
    database: process.env.DB_NAME || 'StockAnalysis',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    instanceName: process.env.DB_INSTANCE || '',
    encrypt: bool(process.env.DB_ENCRYPT, false),
    trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
    poolMax: number(process.env.DB_POOL_MAX, 10),
  },

  /*
   * Kept under the original variable names so the API console keeps showing a
   * real setting. There is no upstream system any more: the TTL only controls
   * how long a dataset built from SQL Server stays cached.
   */
  cacheTtlSeconds: clampInt(process.env.STOCK_SOURCE_CACHE_TTL_SECONDS, 300, 30, 86400),
  timeoutMs: clampInt(process.env.STOCK_SOURCE_TIMEOUT_MS, 8000, 1000, 30000),
  tagOwner: process.env.WIP_TAG_OWNER || 'local-user',

  serveStatic: bool(process.env.SERVE_STATIC, false),
  //test
  useMockData: bool(process.env.USE_MOCK_DATA, false),
  clientDist: process.env.CLIENT_DIST || '../client/dist',
};
