import {
  LOG_RETENTION_DAYS,
  RECENT_CALL_LIMIT,
  STOCK_CACHE_KEYS,
  STOCK_CACHE_LABELS,
} from '../constants.js';
import { TABLES, col, selectList } from '../tables.js';
import { toIsoString, toNumber } from '../util/format.js';

const CACHE_COLUMNS = [
  'cacheKey',
  'payload',
  'source',
  'fetchedAt',
  'expiresAt',
  'itemCount',
  'buildMs',
];
const LOG_COLUMNS = [
  'id',
  'endpoint',
  'method',
  'outcome',
  'httpStatus',
  'durationMs',
  'message',
  'createdAt',
];

const CACHE_TABLE = TABLES.datasetCache;
const LOG_TABLE = TABLES.sourceFetchLog;

const sqlNumber = (error) => {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const info = current.info ?? current.originalError?.info;
    if (info && typeof info.number === 'number') return info.number;
    if (typeof current.number === 'number') return current.number;
    current = current.cause ?? current.originalError ?? null;
  }
  return undefined;
};

const itemCountOf = (key, data) => {
  if (key === 'reserve') return Array.isArray(data.rows) ? data.rows.length : 0;
  return Array.isArray(data.lots) ? data.lots.length : 0;
};

const parsePayload = (key, payload) => {
  const data = JSON.parse(payload);
  const list = key === 'reserve' ? data?.rows : data?.lots;
  if (!data || typeof data !== 'object' || !Array.isArray(list)) {
    throw new Error('cached payload has an unexpected shape');
  }
  return data;
};

export const createCacheService = ({ db, dataset, config, logger }) => {
  const memo = new Map();

  const builders = {
    reserve: () => dataset.buildReserveDataset(),
    wip: () => dataset.buildWipDataset(),
  };

  const meta = ({ key, hit, itemCount, buildMs, fetchedAt, expiresAt, ttlSeconds }) => {
    const fetchedAtMs = fetchedAt ? new Date(fetchedAt).getTime() : 0;
    const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : 0;
    const ageSeconds = fetchedAtMs > 0 ? Math.max(0, Math.round((Date.now() - fetchedAtMs) / 1000)) : 0;
    return {
      key,
      label: STOCK_CACHE_LABELS[key],
      origin: 'snapshot',
      hit,
      itemCount,
      buildMs,
      fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : '',
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : '',
      ageSeconds,
      ttlSeconds: ttlSeconds || config.cacheTtlSeconds,
      stale: expiresAtMs > 0 ? expiresAtMs <= Date.now() : true,
      upstreamError: null,
    };
  };

  const readRow = async (key) => {
    const result = await db.query(
      `SELECT TOP 1 ${selectList(CACHE_TABLE, CACHE_COLUMNS)} FROM ${CACHE_TABLE.name} WHERE ${col(CACHE_TABLE, 'cacheKey')} = @key`,
      [{ name: 'key', type: 'NVarChar', value: key }],
    );
    const row = result.recordset[0];
    if (!row) return null;
    return {
      payload: row.payload,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      itemCount: toNumber(row.itemCount),
      buildMs: toNumber(row.buildMs),
    };
  };

  const writeRow = async (key, data, buildMs, fetchedAt, expiresAt) => {
    const payload = JSON.stringify(data);
    const itemCount = itemCountOf(key, data);
    const update = async () =>
      db.query(
        `UPDATE ${CACHE_TABLE.name}
           SET payload = @payload, source = @source, fetched_at = @fetchedAt, expires_at = @expiresAt,
               item_count = @itemCount, build_ms = @buildMs, _updated_at = SYSUTCDATETIME()
         WHERE ${col(CACHE_TABLE, 'cacheKey')} = @key`,
        [
          { name: 'payload', type: 'NVarChar', value: payload },
          { name: 'source', type: 'NVarChar', value: 'snapshot' },
          { name: 'fetchedAt', type: 'DateTime2', value: fetchedAt },
          { name: 'expiresAt', type: 'DateTime2', value: expiresAt },
          { name: 'itemCount', value: itemCount },
          { name: 'buildMs', value: buildMs },
          { name: 'key', type: 'NVarChar', value: key },
        ],
      );

    const updated = await update();
    if (updated.rowsAffected[0] > 0) return;

    try {
      await db.query(
        `INSERT INTO ${CACHE_TABLE.name}
           (${col(CACHE_TABLE, 'cacheKey')}, ${col(CACHE_TABLE, 'payload')}, ${col(CACHE_TABLE, 'source')}, ${col(CACHE_TABLE, 'fetchedAt')}, ${col(CACHE_TABLE, 'expiresAt')}, ${col(CACHE_TABLE, 'itemCount')}, ${col(CACHE_TABLE, 'buildMs')})
         VALUES (@key, @payload, @source, @fetchedAt, @expiresAt, @itemCount, @buildMs)`,
        [
          { name: 'key', type: 'NVarChar', value: key },
          { name: 'payload', type: 'NVarChar', value: payload },
          { name: 'source', type: 'NVarChar', value: 'snapshot' },
          { name: 'fetchedAt', type: 'DateTime2', value: fetchedAt },
          { name: 'expiresAt', type: 'DateTime2', value: expiresAt },
          { name: 'itemCount', value: itemCount },
          { name: 'buildMs', value: buildMs },
        ],
      );
    } catch (error) {
      const code = sqlNumber(error);
      if (code === 2627 || code === 2601) {
        await update();
        return;
      }
      throw error;
    }
  };

  const logBuild = async (key, outcome, durationMs, message) => {
    try {
      await db.query(
        `INSERT INTO ${LOG_TABLE.name} (endpoint, method, outcome, http_status, duration_ms, message)
         VALUES (@endpoint, @method, @outcome, NULL, @duration, @message)`,
        [
          { name: 'endpoint', type: 'NVarChar', value: `/api/stock/${key}` },
          { name: 'method', type: 'NVarChar', value: 'GET' },
          { name: 'outcome', type: 'NVarChar', value: outcome },
          { name: 'duration', value: durationMs },
          { name: 'message', type: 'NVarChar', value: message.slice(0, 400) },
        ],
      );
      await db.query(
        `DELETE FROM ${LOG_TABLE.name} WHERE _created_at < DATEADD(day, -@days, SYSUTCDATETIME())`,
        [{ name: 'days', value: LOG_RETENTION_DAYS }],
      );
    } catch (error) {
      logger.warn(`Unable to write the dataset call log: ${error.message}`);
    }
  };

  const resolve = async (key, options = {}) => {
    const force = Boolean(options.force);
    const now = Date.now();
    const cached = memo.get(key);

    if (!force && cached && cached.expiresAtMs > now) {
      return {
        data: cached.data,
        meta: meta({
          key,
          hit: true,
          itemCount: cached.itemCount,
          buildMs: cached.buildMs,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          ttlSeconds: cached.ttlSeconds,
        }),
      };
    }

    if (!force) {
      const row = await readRow(key);
      const expiresAtMs = row?.expiresAt ? new Date(row.expiresAt).getTime() : 0;
      if (row && expiresAtMs > now) {
        try {
          const data = parsePayload(key, row.payload);
          const ttlSeconds = Math.max(
            1,
            Math.round((expiresAtMs - new Date(row.fetchedAt).getTime()) / 1000),
          );
          memo.set(key, {
            data,
            expiresAtMs,
            fetchedAt: row.fetchedAt,
            expiresAt: row.expiresAt,
            itemCount: row.itemCount,
            buildMs: row.buildMs,
            ttlSeconds,
          });
          return {
            data,
            meta: meta({
              key,
              hit: true,
              itemCount: row.itemCount,
              buildMs: row.buildMs,
              fetchedAt: row.fetchedAt,
              expiresAt: row.expiresAt,
              ttlSeconds,
            }),
          };
        } catch (error) {
          logger.warn(`Discarding the cached ${key} dataset: ${error.message}`);
        }
      }
    }

    const startedAt = Date.now();
    let data;
    try {
      data = await builders[key]();
    } catch (error) {
      await logBuild(key, 'error', Date.now() - startedAt, error.message);
      throw error;
    }
    const buildMs = Date.now() - startedAt;
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + config.cacheTtlSeconds * 1000);
    const itemCount = itemCountOf(key, data);

    await writeRow(key, data, buildMs, fetchedAt, expiresAt);
    await logBuild(key, 'ok', buildMs, `built from SQL Server (${itemCount} items)`);

    memo.set(key, {
      data,
      expiresAtMs: expiresAt.getTime(),
      fetchedAt,
      expiresAt,
      itemCount,
      buildMs,
      ttlSeconds: config.cacheTtlSeconds,
    });

    return {
      data,
      meta: meta({
        key,
        hit: false,
        itemCount,
        buildMs,
        fetchedAt,
        expiresAt,
        ttlSeconds: config.cacheTtlSeconds,
      }),
    };
  };

  const listMeta = async () => {
    let rows = [];
    try {
      const result = await db.query(
        `SELECT ${selectList(CACHE_TABLE, CACHE_COLUMNS.filter((column) => column !== 'payload'))}
         FROM ${CACHE_TABLE.name}`,
      );
      rows = result.recordset;
    } catch (error) {
      logger.warn(`Unable to read the dataset cache table: ${error.message}`);
    }

    return STOCK_CACHE_KEYS.map((key) => {
      const row = rows.find((item) => item.cacheKey === key);
      if (!row) {
        return meta({ key, hit: false, itemCount: 0, buildMs: 0, fetchedAt: null, expiresAt: null });
      }
      const ttlSeconds = Math.max(
        1,
        Math.round(
          (new Date(row.expiresAt).getTime() - new Date(row.fetchedAt).getTime()) / 1000,
        ),
      );
      return meta({
        key,
        hit: false,
        itemCount: toNumber(row.itemCount),
        buildMs: toNumber(row.buildMs),
        fetchedAt: row.fetchedAt,
        expiresAt: row.expiresAt,
        ttlSeconds,
      });
    });
  };

  const recentCalls = async () => {
    const result = await db.query(
      `SELECT TOP ${RECENT_CALL_LIMIT} ${selectList(LOG_TABLE, LOG_COLUMNS)}
       FROM ${LOG_TABLE.name}
       ORDER BY ${LOG_TABLE.cols.createdAt} DESC`,
    );
    return result.recordset.map((row) => ({
      id: row.id,
      endpoint: row.endpoint ?? '',
      method: row.method ?? 'GET',
      outcome: row.outcome ?? 'ok',
      httpStatus: row.httpStatus === null || row.httpStatus === undefined ? null : toNumber(row.httpStatus),
      durationMs: toNumber(row.durationMs),
      message: row.message ?? '',
      calledAt: toIsoString(row.createdAt) ?? '',
    }));
  };

  const refresh = async (keys) => {
    const targets = keys && keys.length > 0 ? keys : STOCK_CACHE_KEYS;
    const refreshed = [];
    const failures = [];
    for (const key of targets) {
      try {
        const outcome = await resolve(key, { force: true });
        refreshed.push(outcome.meta);
      } catch (error) {
        logger.error(`Unable to rebuild the ${key} dataset: ${error.message}`);
        failures.push({ key, message: error.message });
      }
    }
    return { refreshed, failures };
  };

  return { resolve, listMeta, recentCalls, refresh };
};
