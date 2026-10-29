import { isStockCacheKey, isStockDetailSort, isWipCause } from '../constants.js';
import { badRequest } from '../errors.js';

const ENDPOINTS = [
  {
    name: 'Reserve dataset',
    method: 'GET',
    path: '/api/stock/reserve',
    description:
      'Reserve age bands, histogram, buyers and register, aggregated from SQL Server and cached for the TTL.',
  },
  {
    name: 'WIP dataset',
    method: 'GET',
    path: '/api/stock/wip',
    description:
      'WIP signal lights, time-on-line histogram and lots, read from SQL Server and cached for the TTL.',
  },
];

export const createQueryService = ({ dataset, cache, config }) => {
  const overview = async () => {
    const [meta, cube, wipSummary] = await Promise.all([
      dataset.loadMeta(),
      dataset.loadCube(),
      dataset.readWipSummary(),
    ]);
    return {
      meta,
      cube,
      wipSummary,
      reserveSummary: dataset.computeReserveSummary(cube, meta),
    };
  };

  const detail = async (filter) => dataset.queryDetailLines(filter);

  const reserve = async () => {
    const outcome = await cache.resolve('reserve');
    return outcome.data;
  };

  const wip = async () => {
    const outcome = await cache.resolve('wip');
    return dataset.applyWipTags(outcome.data);
  };

  const sourceStatus = async () => {
    let cacheMeta = [];
    try {
      cacheMeta = await cache.listMeta();
    } catch {
      cacheMeta = [];
    }

    let recentCalls = [];
    try {
      recentCalls = await cache.recentCalls();
    } catch {
      recentCalls = [];
    }

    return {
      configured: false,
      baseUrl: null,
      tokenMasked: null,
      cacheTtlSeconds: config.cacheTtlSeconds,
      timeoutMs: config.timeoutMs,
      envVars: {
        baseUrl: 'STOCK_SOURCE_BASE_URL',
        token: 'STOCK_SOURCE_TOKEN',
        cacheTtl: 'STOCK_SOURCE_CACHE_TTL_SECONDS',
        timeout: 'STOCK_SOURCE_TIMEOUT_MS',
      },
      endpoints: ENDPOINTS,
      cache: cacheMeta,
      recentCalls,
    };
  };

  const normalizeKeys = (keys) => {
    if (keys === undefined || keys === null) return undefined;
    if (!Array.isArray(keys)) throw badRequest('keys must be an array of dataset keys');
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!isStockCacheKey(key)) throw badRequest(`Unknown cache key: ${key}`);
    }
    return unique;
  };

  const refreshCache = async (keys) => cache.refresh(normalizeKeys(keys));

  const updateTag = async ({ lotId, cause, blueFlag }) => {
    if (cause === undefined && blueFlag === undefined) {
      throw badRequest('Nothing to update: provide cause or blueFlag');
    }
    if (cause !== undefined && cause !== null && !isWipCause(cause)) {
      throw badRequest(`Unknown WIP cause: ${cause}`);
    }
    if (blueFlag !== undefined && typeof blueFlag !== 'boolean') {
      throw badRequest('blueFlag must be a boolean');
    }
    const normalizedCause = cause === undefined || cause === null ? null : cause;
    return dataset.upsertWipTag(lotId, normalizedCause, Boolean(blueFlag), config.tagOwner);
  };

  const normalizeDetailQuery = (raw) => {
    const sort = raw.sort || 'usd';
    if (!isStockDetailSort(sort)) throw badRequest(`Unknown sort: ${sort}`);
    const dir = raw.dir || 'desc';
    if (dir !== 'asc' && dir !== 'desc') throw badRequest(`Unknown dir: ${dir}`);

    const int = (value, label, min, max) => {
      if (value === undefined || value === '') return undefined;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < min) {
        throw badRequest(`${label} must be an integer greater than or equal to ${min}`);
      }
      if (max !== undefined && parsed > max) {
        throw badRequest(`${label} must be less than or equal to ${max}`);
      }
      return parsed;
    };

    const year = raw.year === undefined || raw.year === '' ? undefined : String(raw.year);
    if (year !== undefined && !/^\d{4}$/.test(year)) throw badRequest('year must be a 4 digit year');

    const query = raw.q === undefined ? undefined : String(raw.q).trim().slice(0, 120);

    return {
      cust: int(raw.cust, 'cust', 0),
      wh: int(raw.wh, 'wh', 0),
      cat: int(raw.cat, 'cat', 0),
      age: int(raw.age, 'age', 0, 5),
      year,
      q: query ? query : undefined,
      sort,
      dir,
      page: int(raw.page, 'page', 1) ?? 1,
      pageSize: int(raw.pageSize, 'pageSize', 1, 100) ?? 25,
    };
  };

  return {
    overview,
    detail,
    reserve,
    wip,
    sourceStatus,
    refreshCache,
    updateTag,
    normalizeDetailQuery,
  };
};
