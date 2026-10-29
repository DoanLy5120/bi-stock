/*
 * Logic harness — runs without SQL Server and without npm dependencies.
 * It exercises the ported aggregation/SQL-building code with a fake database so
 * a regression in the pure logic is caught before deploying.
 *
 *   node test/logic.test.mjs
 */
import assert from 'node:assert/strict';

import { createCacheService } from '../server/services/cache.js';
import { createDatasetService } from '../server/services/dataset.js';
import { createQueryService } from '../server/services/query.js';
import { monthRange, toDateString } from '../server/util/format.js';
import { reserveBandIndex } from '../server/constants.js';
import { makeDb } from '../server/mock-db.js';
import {wipLotRows } from '../server/mock-db.js';

const quietLogger = { info: () => {}, warn: () => {}, error: () => {} };

const snapshotDate = new Date('2025-10-25T00:00:00.000Z');

const wipSummary = {
  storeIdx: 3,
  usd: 1000,
  qty: 10,
  lines: 3,
  oldest: 12,
  redUsd: 600,
  redLines: 2,
  registerUsd: 400,
  registerLines: 1,
  lights: [
    { usd: 600, qty: 6, lines: 2 },
    { usd: 400, qty: 4, lines: 1 },
  ],
  weeks: [{ label: '1–7', usd: 600, lines: 2, byLight: [2, 0] }],
  catLight: [[1, 0]],
  custLight: [[2, 0]],
};

const warehouseRows = [
  { idx: 0, nameZh: '其它仓', nameEn: 'Other', rawName: 'Other WH', totalUsd: 9999 },
  {
    idx: 3,
    nameZh: '保留物料仓',
    nameEn: 'Reserve',
    rawName: 'Reserve Materials - WH3',
    totalUsd: 1500,
  },
];

const categoryRows = [
  { idx: 0, nameZh: '原料', nameEn: 'Raw material' },
  { idx: 1, nameZh: '包装', nameEn: 'Packaging' },
];

const customerRows = [
  { idx: 0, name: 'Alpha' },
  { idx: 1, name: 'Beta' },
  { idx: 2, name: 'Gamma' },
];

const cubeRows = [
  { customerIdx: 0, warehouseIdx: 3, categoryIdx: 0, ageIdx: 0, yearIdx: 1, monthIdx: 11, qty: 1, usd: 100, lines: 1 },
  { customerIdx: 1, warehouseIdx: 3, categoryIdx: 0, ageIdx: 1, yearIdx: 0, monthIdx: 8, qty: 2, usd: 200, lines: 2 },
  { customerIdx: 1, warehouseIdx: 3, categoryIdx: 1, ageIdx: 2, yearIdx: 0, monthIdx: 5, qty: 3, usd: 400, lines: 3 },
  { customerIdx: 2, warehouseIdx: 3, categoryIdx: 1, ageIdx: 3, yearIdx: 0, monthIdx: 0, qty: 4, usd: 800, lines: 4 },
  { customerIdx: 9, warehouseIdx: 0, categoryIdx: 1, ageIdx: 4, yearIdx: 0, monthIdx: 0, qty: 9, usd: 9999, lines: 99 },
];

const detailRows = [
  {
    id: 'line-1',
    goodsNo: 'G-001',
    itemName: 'Steel coil',
    categoryIdx: 0,
    customerIdx: 0,
    customerName: 'Alpha',
    warehouseIdx: 3,
    warehouseName: 'Reserve Materials - WH3',
    qty: 1,
    unit: 'PCS',
    usd: 100,
    ageDays: 120,
    batchNo: 'B-1',
    lotDate: new Date('2025-06-01T00:00:00.000Z'),
    reasonWh: '',
    reasonDl: 'Slow moving',
    monthIdx: 5,
  },
  {
    id: 'line-2',
    goodsNo: 'G-002',
    itemName: 'Carton',
    categoryIdx: 1,
    customerIdx: 1,
    customerName: 'Beta',
    warehouseIdx: 3,
    warehouseName: 'Reserve Materials - WH3',
    qty: 2,
    unit: 'PCS',
    usd: 200,
    ageDays: 30,
    batchNo: 'B-2',
    lotDate: null,
    reasonWh: 'Quality hold',
    reasonDl: '',
    monthIdx: 8,
  },
];

const wipLotRows = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    goodsNo: 'G-100',
    itemName: 'Lens',
    customerIdx: 1,
    qty: 5,
    unit: 'PCS',
    usd: 500,
    days: 21,
    batchNo: 'W-1',
    lotDate: new Date('2025-09-01T00:00:00.000Z'),
    monthIdx: 9,
  },
];

const makeDb = (overrides = {}) => {
  const data = {
    snapshot: {
      id: 'snap-1',
      snapshotDate,
      lineCount: 2,
      skuCount: 2,
      totalUsd: 1500,
      totalQty: 30,
      detailCount: detailRows.length,
      detailUsd: 300,
      spanFrom: '2024-11',
      spanTo: '2025-10',
      wipSummary: JSON.stringify(wipSummary),
      years: '["2025","2024"]',
    },
    warehouses: warehouseRows,
    categories: categoryRows,
    customers: customerRows,
    cube: cubeRows,
    detailRows,
    detailTotal: 42,
    wipLots: wipLotRows,
    tags: [],
    cacheRows: [],
    logRows: [],
    lotExists: true,
    ...overrides,
  };
  const queries = [];

  const run = async (text, inputs = []) => {
    queries.push({ text, inputs });
    const t = text.replace(/\s+/g, ' ');

    if (t.includes('FROM stock_snapshot')) return { recordset: [data.snapshot] };
    if (t.includes('FROM stock_warehouse')) return { recordset: data.warehouses };
    if (t.includes('FROM stock_category')) return { recordset: data.categories };
    if (t.includes('FROM stock_customer')) return { recordset: data.customers };
    if (t.includes('FROM stock_cube_cell')) return { recordset: data.cube };
    if (t.includes('COUNT(1) AS total')) return { recordset: [{ total: data.detailTotal }] };
    if (t.includes('FROM stock_detail_line')) return { recordset: data.detailRows };
    if (t.includes('FROM wip_lot_tag')) return { recordset: data.tags };
    if (t.includes('FROM wip_lot WHERE')) {
      return { recordset: data.lotExists ? [{ id: wipLotRows[0].id }] : [] };
    }
    if (t.includes('FROM wip_lot')) return { recordset: data.wipLots };
    if (t.includes('FROM dataset_cache')) return { recordset: data.cacheRows };
    if (t.includes('FROM source_fetch_log')) return { recordset: data.logRows };
    return { recordset: [], rowsAffected: [1] };
  };

  return {
    data,
    queries,
    query: run,
    async transaction(fn) {
      return fn(run);
    },
  };
};

const config = {
  cacheTtlSeconds: 300,
  timeoutMs: 8000,
  tagOwner: 'local-user',
};

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/* ---------- constants / formatting ---------- */

test('monthRange spans 12 months inclusively', () => {
  const months = monthRange('2024-11', '2025-10');
  assert.equal(months.length, 12);
  assert.equal(months[0], '2024-11');
  assert.equal(months[11], '2025-10');
});

test('reserveBandIndex uses band boundaries', () => {
  assert.equal(reserveBandIndex(0), 0);
  assert.equal(reserveBandIndex(2.9), 0);
  assert.equal(reserveBandIndex(3), 1);
  assert.equal(reserveBandIndex(6), 2);
  assert.equal(reserveBandIndex(9), 3);
  assert.equal(reserveBandIndex(12), 4);
  assert.equal(reserveBandIndex(60), 4);
});

test('toDateString returns a UTC day and keeps null', () => {
  assert.equal(toDateString(new Date('2025-06-01T00:00:00.000Z')), '2025-06-01');
  assert.equal(toDateString(null), null);
});

/* ---------- meta / reserve ---------- */

test('loadMeta builds months, years and customers', async () => {
  const dataset = createDatasetService({ db: makeDb(), logger: quietLogger });
  const meta = await dataset.loadMeta();
  assert.equal(meta.months.length, 12);
  assert.deepEqual(meta.years, ['2025', '2024']);
  assert.equal(meta.customers.length, 3);
  assert.equal(meta.warehouses.length, 2);
  assert.equal(meta.snapshotDate, '2025-10-25');
});

test('computeReserveSummary buckets by months on hand and flags 6+ months', async () => {
  const db = makeDb();
  const dataset = createDatasetService({ db, logger: quietLogger });
  const meta = await dataset.loadMeta();
  const cube = await dataset.loadCube();
  const summary = dataset.computeReserveSummary(cube, meta);

  assert.equal(summary.warehouseIdx, 3);
  assert.deepEqual(
    summary.bands.map((band) => band.usd),
    [100, 200, 400, 800, 0],
  );
  assert.equal(summary.usd, 1500);
  assert.equal(summary.atRiskUsd, 1200);
  assert.equal(summary.atRiskLines, 7);
  assert.equal(summary.oldestBandIndex, 4);
});

test('buildReserveDataset fills the histogram and risk buyers only', async () => {
  const dataset = createDatasetService({ db: makeDb(), logger: quietLogger });
  const reserve = await dataset.buildReserveDataset();

  assert.deepEqual(
    reserve.hist.map((bin) => bin.usd),
    [100, 0, 0, 200, 400, 800, 0],
  );
  assert.deepEqual(
    reserve.buyers.map((buyer) => [buyer.name, buyer.usd]),
    [
      ['Gamma', 800],
      ['Beta', 400],
    ],
  );
  assert.equal(reserve.rows.length, 2);
  assert.equal(reserve.itemisedUsd, 300);
  assert.equal(reserve.bandBuyers[0][0].name, 'Alpha');
});

test('detail query maps names, reasons and lot dates', async () => {
  const dataset = createDatasetService({ db: makeDb(), logger: quietLogger });
  const result = await dataset.queryDetailLines({ wh: 3, sort: 'usd', dir: 'desc', page: 2, pageSize: 25 });

  assert.equal(result.total, 42);
  assert.equal(result.page, 2);
  assert.equal(result.items[0].warehouseEn, 'Reserve');
  assert.equal(result.items[0].categoryZh, '原料');
  assert.equal(result.items[0].lotDate, '2025-06-01');
  assert.equal(result.items[0].reasonWh, '');
  assert.equal(result.items[1].lotDate, null);
  assert.equal(result.items[1].reasonDl, '');
});

test('detail SQL uses OFFSET/FETCH, filters and a lower-case LIKE search', async () => {
  const db = makeDb();
  const dataset = createDatasetService({ db, logger: quietLogger });
  await dataset.queryDetailLines({ wh: 3, q: 'Steel', age: 3, year: '2025', sort: 'age', dir: 'asc', page: 3, pageSize: 10 });

  const pageQuery = db.queries.find((entry) => entry.text.includes('OFFSET @offset'));
  assert.ok(pageQuery, 'paged query was issued');
  const sql = pageQuery.text.replace(/\s+/g, ' ');
  assert.ok(sql.includes('ORDER BY age_days ASC, usd DESC'));
  assert.ok(sql.includes('warehouse_idx = @wh'));
  assert.ok(sql.includes('age_days >= @ageFrom AND age_days <= @ageTo'));
  assert.ok(sql.includes('CONVERT(date, @yearFrom)'));
  assert.ok(sql.includes('LOWER(item_name) LIKE @term'));
  const offset = pageQuery.inputs.find((input) => input.name === 'offset');
  assert.equal(offset.value, 20);
  const term = pageQuery.inputs.find((input) => input.name === 'term');
  assert.equal(term.value, '%steel%');
});

test('WIP dataset reads lots and applies stored tags', async () => {
  const db = makeDb({
    tags: [{ lotId: '11111111-1111-1111-1111-111111111111', cause: 'quality', blueFlag: true }],
  });
  const dataset = createDatasetService({ db, logger: quietLogger });
  const base = await dataset.buildWipDataset();
  const withTags = await dataset.applyWipTags(base);

  assert.equal(withTags.lots.length, 1);
  assert.equal(withTags.lots[0].customerName, 'Beta');
  assert.equal(withTags.lots[0].days, 21);
  assert.equal(withTags.lots[0].lotDate, '2025-09-01');
  assert.equal(withTags.lots[0].cause, 'quality');
  assert.equal(withTags.lots[0].blueFlag, true);
  assert.equal(withTags.summary.storeIdx, 3);
  assert.equal(withTags.customers[1], 'Beta');
});

test('invalid WIP summary fails loudly', async () => {
  const db = makeDb({
    snapshot: {
      ...makeDb().data.snapshot,
      wipSummary: 'not-json',
    },
  });
  const dataset = createDatasetService({ db, logger: quietLogger });
  await assert.rejects(() => dataset.readWipSummary(), /WIP summary is invalid/);
});

test('WIP tag upsert rejects unknown lots and writes otherwise', async () => {
  const missing = createDatasetService({ db: makeDb({ lotExists: false }), logger: quietLogger });
  await assert.rejects(
    () => missing.upsertWipTag(wipLotRows[0].id, 'quality', true, 'local-user'),
    /WIP lot not found/,
  );

  const bad = createDatasetService({ db: makeDb(), logger: quietLogger });
  await assert.rejects(() => bad.upsertWipTag('not-a-guid', null, true, 'local-user'), /not found/);

  const db = makeDb();
  const dataset = createDatasetService({ db, logger: quietLogger });
  const tag = await dataset.upsertWipTag(wipLotRows[0].id, null, true, 'local-user');
  assert.deepEqual(tag, { lotId: wipLotRows[0].id, cause: null, blueFlag: true });
  const insert = db.queries.find((entry) => entry.text.startsWith('INSERT INTO wip_lot_tag'));
  assert.ok(insert, 'tag insert issued');
  assert.equal(insert.inputs.find((input) => input.name === 'blueFlag').value, true);
});

/* ---------- cache ---------- */

test('cache resolves from the database build, then hits memory', async () => {
  const db = makeDb();
  const dataset = createDatasetService({ db, logger: quietLogger });
  const cache = createCacheService({ db, dataset, config, logger: quietLogger });

  const first = await cache.resolve('reserve', { force: true });
  assert.equal(first.meta.origin, 'snapshot');
  assert.equal(first.meta.hit, false);
  assert.equal(first.meta.itemCount, 2);
  assert.ok(first.meta.ttlSeconds >= 300);
  assert.ok(first.meta.fetchedAt.length > 10);
  assert.equal(first.data.rows.length, 2);

  const second = await cache.resolve('reserve');
  assert.equal(second.meta.hit, true);

  const status = await cache.listMeta();
  assert.deepEqual(
    status.map((entry) => entry.key),
    ['reserve', 'wip'],
  );
});

test('cache reports a failure per key without aborting the refresh', async () => {
  const db = makeDb();
  const dataset = createDatasetService({ db, logger: quietLogger });
  const broken = {
    ...dataset,
    buildWipDataset: async () => {
      throw new Error('boom');
    },
  };
  const cache = createCacheService({ db, dataset: broken, config, logger: quietLogger });
  const result = await cache.refresh(['reserve', 'wip']);
  assert.equal(result.refreshed.length, 1);
  assert.equal(result.refreshed[0].key, 'reserve');
  assert.deepEqual(result.failures, [{ key: 'wip', message: 'boom' }]);
});

/* ---------- query service / validation ---------- */

test('normalizeDetailQuery validates and defaults', () => {
  const dataset = createDatasetService({ db: makeDb(), logger: quietLogger });
  const cache = createCacheService({ db: makeDb(), dataset, config, logger: quietLogger });
  const query = createQueryService({ dataset, cache, config });

  const parsed = query.normalizeDetailQuery({ wh: '3', sort: 'age', dir: 'asc', page: '2', pageSize: '10' });
  assert.equal(parsed.wh, 3);
  assert.equal(parsed.sort, 'age');
  assert.equal(parsed.dir, 'asc');
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 10);

  const defaults = query.normalizeDetailQuery({});
  assert.equal(defaults.sort, 'usd');
  assert.equal(defaults.dir, 'desc');
  assert.equal(defaults.page, 1);
  assert.equal(defaults.pageSize, 25);

  assert.throws(() => query.normalizeDetailQuery({ sort: 'nope' }), /Unknown sort/);
  assert.throws(() => query.normalizeDetailQuery({ page: '0' }), /page must be an integer/);
  assert.throws(() => query.normalizeDetailQuery({ pageSize: '500' }), /pageSize must be less than/);
  assert.throws(() => query.normalizeDetailQuery({ age: '9' }), /age must be less than/);
  assert.throws(() => query.normalizeDetailQuery({ year: '25' }), /4 digit year/);
});

test('updateTag validates cause and blue flag', async () => {
  const dataset = createDatasetService({ db: makeDb(), logger: quietLogger });
  const cache = createCacheService({ db: makeDb(), dataset, config, logger: quietLogger });
  const query = createQueryService({ dataset, cache, config });

  await assert.rejects(() => query.updateTag({ lotId: wipLotRows[0].id }), /Nothing to update/);
  await assert.rejects(
    () => query.updateTag({ lotId: wipLotRows[0].id, cause: 'exploded' }),
    /Unknown WIP cause/,
  );
  await assert.rejects(
    () => query.updateTag({ lotId: wipLotRows[0].id, blueFlag: 'yes' }),
    /blueFlag must be a boolean/,
  );

  const tag = await query.updateTag({ lotId: wipLotRows[0].id, cause: null, blueFlag: true });
  assert.equal(tag.blueFlag, true);
  assert.equal(tag.cause, null);
});

test('refreshCache rejects unknown keys', async () => {
  const dataset = createDatasetService({ db: makeDb(), logger: quietLogger });
  const cache = createCacheService({ db: makeDb(), dataset, config, logger: quietLogger });
  const query = createQueryService({ dataset, cache, config });
  await assert.rejects(() => query.refreshCache(['nope']), /Unknown cache key: nope/);
});

test('sourceStatus keeps the console contract while there is no upstream', async () => {
  const db = makeDb();
  const dataset = createDatasetService({ db, logger: quietLogger });
  const cache = createCacheService({ db, dataset, config, logger: quietLogger });
  const query = createQueryService({ dataset, cache, config });
  const status = await query.sourceStatus();

  assert.equal(status.configured, false);
  assert.equal(status.baseUrl, null);
  assert.equal(status.cacheTtlSeconds, 300);
  assert.equal(status.envVars.cacheTtl, 'STOCK_SOURCE_CACHE_TTL_SECONDS');
  assert.equal(status.endpoints.length, 2);
  assert.equal(status.endpoints[0].method, 'GET');
  assert.equal(status.cache.length, 2);
  assert.ok(Array.isArray(status.recentCalls));
});

/* ---------- runner ---------- */

let failed = 0;
for (const item of cases) {
  try {
    await item.fn();
    console.log(`PASS  ${item.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${item.name}\n      ${error.message}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} checks passed`);
if (failed > 0) process.exitCode = 1;
