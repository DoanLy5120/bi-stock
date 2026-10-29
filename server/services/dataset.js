import {
  MAX_INTERNAL_PAGE_SIZE,
  MEMO_TTL_MS,
  RESERVE_BAND_DEFS,
  RESERVE_BIN_DEFS,
  RISK_BAND_START,
  STOCK_AGE_BOUNDS,
  STOCK_AGE_LABELS,
  reserveBandIndex,
} from '../constants.js';
import { internalError, notFound } from '../errors.js';
import { TABLES, col, selectList } from '../tables.js';
import {
  monthRange,
  monthsOnHand,
  parseJson,
  readStringArray,
  toDateString,
  toNumber,
} from '../util/format.js';

const SNAPSHOT_COLUMNS = [
  'id',
  'snapshotDate',
  'lineCount',
  'skuCount',
  'totalUsd',
  'totalQty',
  'detailCount',
  'detailUsd',
  'spanFrom',
  'spanTo',
  'wipSummary',
  'years',
];
const WAREHOUSE_COLUMNS = ['idx', 'nameZh', 'nameEn', 'rawName', 'totalUsd'];
const CATEGORY_COLUMNS = ['idx', 'nameZh', 'nameEn'];
const CUSTOMER_COLUMNS = ['idx', 'name'];
const CUBE_COLUMNS = [
  'customerIdx',
  'warehouseIdx',
  'categoryIdx',
  'ageIdx',
  'yearIdx',
  'monthIdx',
  'qty',
  'usd',
  'lines',
];
const DETAIL_COLUMNS = [
  'id',
  'goodsNo',
  'itemName',
  'categoryIdx',
  'customerIdx',
  'customerName',
  'warehouseIdx',
  'warehouseName',
  'qty',
  'unit',
  'usd',
  'ageDays',
  'batchNo',
  'lotDate',
  'reasonWh',
  'reasonDl',
  'monthIdx',
];
const WIP_COLUMNS = [
  'id',
  'goodsNo',
  'itemName',
  'customerIdx',
  'qty',
  'unit',
  'usd',
  'days',
  'batchNo',
  'lotDate',
  'monthIdx',
];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DETAIL_TABLE = TABLES.detailLine;
const WIP_TABLE = TABLES.wipLot;
const TAG_TABLE = TABLES.wipLotTag;

export const createDatasetService = ({ db, logger }) => {
  let snapshotMemo = null;
  let metaMemo = null;
  let cubeMemo = null;

  const loadSnapshot = async () => {
    if (snapshotMemo && snapshotMemo.expiresAt > Date.now()) return snapshotMemo.value;
    const result = await db.query(
      `SELECT TOP 1 ${selectList(TABLES.snapshot, SNAPSHOT_COLUMNS)} FROM ${TABLES.snapshot.name}`,
    );
    const row = result.recordset[0];
    if (!row) throw notFound('Stock snapshot has not been loaded yet');
    const value = {
      id: row.id,
      snapshotDate: toDateString(row.snapshotDate),
      lineCount: toNumber(row.lineCount),
      skuCount: toNumber(row.skuCount),
      totalUsd: toNumber(row.totalUsd),
      totalQty: toNumber(row.totalQty),
      detailCount: toNumber(row.detailCount),
      detailUsd: toNumber(row.detailUsd),
      spanFrom: String(row.spanFrom ?? ''),
      spanTo: String(row.spanTo ?? ''),
      wipSummary: row.wipSummary,
      years: row.years,
    };
    snapshotMemo = { value, expiresAt: Date.now() + MEMO_TTL_MS };
    return value;
  };

  const loadMeta = async () => {
    if (metaMemo && metaMemo.expiresAt > Date.now()) return metaMemo.value;

    const snapshot = await loadSnapshot();
    const [warehouseResult, categoryResult, customerResult] = await Promise.all([
      db.query(
        `SELECT ${selectList(TABLES.warehouse, WAREHOUSE_COLUMNS)} FROM ${TABLES.warehouse.name} ORDER BY ${col(TABLES.warehouse, 'idx')}`,
      ),
      db.query(
        `SELECT ${selectList(TABLES.category, CATEGORY_COLUMNS)} FROM ${TABLES.category.name} ORDER BY ${col(TABLES.category, 'idx')}`,
      ),
      db.query(`SELECT ${selectList(TABLES.customer, CUSTOMER_COLUMNS)} FROM ${TABLES.customer.name} ORDER BY ${col(TABLES.customer, 'idx')}`),
    ]);

    const value = {
      snapshotDate: snapshot.snapshotDate,
      lineCount: snapshot.lineCount,
      skuCount: snapshot.skuCount,
      totalUsd: snapshot.totalUsd,
      totalQty: snapshot.totalQty,
      detailCount: snapshot.detailCount,
      detailUsd: snapshot.detailUsd,
      spanFrom: snapshot.spanFrom,
      spanTo: snapshot.spanTo,
      months: monthRange(snapshot.spanFrom, snapshot.spanTo),
      years: readStringArray(snapshot.years),
      ages: [...STOCK_AGE_LABELS],
      warehouses: warehouseResult.recordset.map((row) => ({
        idx: toNumber(row.idx),
        nameZh: row.nameZh ?? '',
        nameEn: row.nameEn ?? '',
        rawName: row.rawName ?? '',
        totalUsd: toNumber(row.totalUsd),
      })),
      categories: categoryResult.recordset.map((row) => ({
        idx: toNumber(row.idx),
        nameZh: row.nameZh ?? '',
        nameEn: row.nameEn ?? '',
      })),
      customers: customerResult.recordset.map((row) => String(row.name ?? '')),
    };
    metaMemo = { value, expiresAt: Date.now() + MEMO_TTL_MS };
    return value;
  };

  const loadCube = async () => {
    if (cubeMemo && cubeMemo.expiresAt > Date.now()) return cubeMemo.value;
    const result = await db.query(
      `SELECT ${selectList(TABLES.cubeCell, CUBE_COLUMNS)} FROM ${TABLES.cubeCell.name}`,
    );
    const value = result.recordset.map((row) => ({
      customerIdx: toNumber(row.customerIdx),
      warehouseIdx: toNumber(row.warehouseIdx),
      categoryIdx: toNumber(row.categoryIdx),
      ageIdx: toNumber(row.ageIdx),
      yearIdx: toNumber(row.yearIdx),
      monthIdx: toNumber(row.monthIdx),
      qty: toNumber(row.qty),
      usd: toNumber(row.usd),
      lines: toNumber(row.lines),
    }));
    cubeMemo = { value, expiresAt: Date.now() + MEMO_TTL_MS };
    return value;
  };

  const readWipSummary = async () => {
    const snapshot = await loadSnapshot();
    const parsed = parseJson(snapshot.wipSummary, null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logger.error('Stored WIP summary is invalid: payload is not a JSON object');
      throw internalError('Stored WIP summary is invalid');
    }
    return parsed;
  };

  const resolveReserveWarehouseIdx = (meta) => {
    const match = meta.warehouses.find(
      (warehouse) =>
        /reserve\s+materials/i.test(warehouse.rawName) ||
        /reserve\s+materials/i.test(warehouse.nameEn),
    );
    return match ? match.idx : 0;
  };

  const computeReserveSummary = (cube, meta) => {
    const snapshotIdx = meta.months.length - 1;
    const warehouseIdx = resolveReserveWarehouseIdx(meta);
    const bands = RESERVE_BAND_DEFS.map((definition) => ({
      key: definition.key,
      labelZh: definition.labelZh,
      labelEn: definition.labelEn,
      fromMonth: definition.fromMonth,
      toMonth: definition.toMonth,
      usd: 0,
      qty: 0,
      lines: 0,
    }));

    let usd = 0;
    let qty = 0;
    let lines = 0;
    for (const cell of cube) {
      if (cell.warehouseIdx !== warehouseIdx) continue;
      const months = monthsOnHand(cell.monthIdx, snapshotIdx);
      const band = bands[reserveBandIndex(months)];
      band.usd += cell.usd;
      band.qty += cell.qty;
      band.lines += cell.lines;
      usd += cell.usd;
      qty += cell.qty;
      lines += cell.lines;
    }

    const oldestBand = bands[bands.length - 1];
    const riskBands = bands.slice(RISK_BAND_START);
    const atRiskUsd = riskBands.reduce((total, band) => total + band.usd, 0);
    const atRiskLines = riskBands.reduce((total, band) => total + band.lines, 0);
    const warehouse = meta.warehouses.find((item) => item.idx === warehouseIdx);

    return {
      warehouseIdx,
      nameZh: warehouse ? warehouse.nameZh : 'Reserve Materials',
      nameEn: warehouse ? warehouse.nameEn : 'Reserve Materials',
      usd,
      qty,
      lines,
      atRiskUsd,
      atRiskLines,
      oldestMonths: oldestBand.fromMonth,
      oldestLines: oldestBand.lines,
      oldestBandIndex: bands.length - 1,
      bands,
    };
  };

  const buildReserveDataset = async () => {
    const meta = await loadMeta();
    const cube = await loadCube();
    const summary = computeReserveSummary(cube, meta);
    const snapshotIdx = meta.months.length - 1;

    const hist = RESERVE_BIN_DEFS.map((definition) => ({
      label: definition.label,
      fromMonth: definition.fromMonth,
      toMonth: definition.toMonth,
      bandIndex: reserveBandIndex(definition.fromMonth),
      usd: 0,
      lines: 0,
    }));
    const bandBuyers = RESERVE_BAND_DEFS.map(() => new Map());

    const accumulateBuyer = (bucket, idx, amount, lineCount) => {
      const current = bucket.get(idx) ?? { idx, name: meta.customers[idx] ?? '', usd: 0, lines: 0 };
      current.usd += amount;
      current.lines += lineCount;
      bucket.set(idx, current);
    };

    for (const cell of cube) {
      if (cell.warehouseIdx !== summary.warehouseIdx) continue;
      const months = monthsOnHand(cell.monthIdx, snapshotIdx);
      const bin =
        hist.find((entry) => months >= entry.fromMonth && months < entry.toMonth) ??
        hist[hist.length - 1];
      bin.usd += cell.usd;
      bin.lines += cell.lines;

      accumulateBuyer(bandBuyers[reserveBandIndex(months)], cell.customerIdx, cell.usd, cell.lines);
    }

    const rows = await queryDetailLines({
      wh: summary.warehouseIdx,
      page: 1,
      pageSize: MAX_INTERNAL_PAGE_SIZE,
    });
    const itemisedUsd = rows.items.reduce((total, line) => total + line.usd, 0);

    const riskBuyers = new Map();
    bandBuyers.forEach((bucket, index) => {
      if (index < RISK_BAND_START) return;
      bucket.forEach((buyer) => {
        accumulateBuyer(riskBuyers, buyer.idx, buyer.usd, buyer.lines);
      });
    });

    return {
      warehouseIdx: summary.warehouseIdx,
      nameZh: summary.nameZh,
      nameEn: summary.nameEn,
      usd: summary.usd,
      qty: summary.qty,
      lines: summary.lines,
      itemisedUsd,
      bands: summary.bands,
      hist,
      atRiskUsd: summary.atRiskUsd,
      atRiskLines: summary.atRiskLines,
      oldestMonths: summary.oldestMonths,
      oldestLines: summary.oldestLines,
      oldestBandIndex: summary.oldestBandIndex,
      buyers: [...riskBuyers.values()].sort((left, right) => right.usd - left.usd),
      bandBuyers: bandBuyers.map((bucket) =>
        [...bucket.values()].sort((left, right) => right.usd - left.usd),
      ),
      rows: rows.items,
    };
  };

  const mapWipLot = (row, customers) => ({
    id: row.id,
    goodsNo: row.goodsNo ?? '',
    itemName: row.itemName ?? '',
    customerIdx: toNumber(row.customerIdx),
    customerName: customers[toNumber(row.customerIdx)] ?? '',
    qty: toNumber(row.qty),
    unit: row.unit ?? '',
    usd: toNumber(row.usd),
    days: toNumber(row.days),
    batchNo: row.batchNo ?? '',
    lotDate: toDateString(row.lotDate) ?? '',
    cause: null,
    blueFlag: false,
  });

  const buildWipDataset = async () => {
    const meta = await loadMeta();
    const summary = await readWipSummary();
    const result = await db.query(
      `SELECT ${selectList(WIP_TABLE, WIP_COLUMNS)} FROM ${WIP_TABLE.name}
       ORDER BY ${col(WIP_TABLE, 'days')} DESC, ${col(WIP_TABLE, 'usd')} DESC`,
    );

    return {
      summary,
      customers: meta.customers,
      lots: result.recordset.map((row) => mapWipLot(row, meta.customers)),
    };
  };

  const loadWipTags = async () => {
    const result = await db.query(
      `SELECT ${col(TAG_TABLE, 'lotId')} AS lotId, ${col(TAG_TABLE, 'cause')} AS cause, ${col(TAG_TABLE, 'blueFlag')} AS blueFlag
       FROM ${TAG_TABLE.name}`,
    );
    const tags = new Map();
    for (const row of result.recordset) {
      tags.set(row.lotId, {
        lotId: row.lotId,
        cause: row.cause ? row.cause : null,
        blueFlag: Boolean(row.blueFlag),
      });
    }
    return tags;
  };

  const applyWipTags = async (dataset) => {
    let tags;
    try {
      tags = await loadWipTags();
    } catch (error) {
      logger.warn(`Unable to load WIP tags: ${error.message}`);
      return dataset;
    }
    if (tags.size === 0) return dataset;
    return {
      ...dataset,
      lots: dataset.lots.map((lot) => {
        const tag = tags.get(lot.id);
        if (!tag) return lot;
        return { ...lot, cause: tag.cause, blueFlag: tag.blueFlag };
      }),
    };
  };

  const upsertWipTag = async (lotId, cause, blueFlag, userId) => {
    if (!GUID.test(String(lotId ?? ''))) throw notFound('WIP lot not found');

    const lotResult = await db.query(
      `SELECT TOP 1 ${col(WIP_TABLE, 'id')} AS id FROM ${WIP_TABLE.name} WHERE ${col(WIP_TABLE, 'id')} = @lotId`,
      [{ name: 'lotId', type: 'UniqueIdentifier', value: lotId }],
    );
    if (lotResult.recordset.length === 0) throw notFound('WIP lot not found');

    await db.transaction(async (exec) => {
      await exec(
        `DELETE FROM ${TAG_TABLE.name}
         WHERE ${col(TAG_TABLE, 'lotId')} = @lotId AND ${col(TAG_TABLE, 'owner')} = @owner`,
        [
          { name: 'lotId', type: 'UniqueIdentifier', value: lotId },
          { name: 'owner', type: 'NVarChar', value: userId },
        ],
      );
      if (cause || blueFlag) {
        await exec(
          `INSERT INTO ${TAG_TABLE.name}
             (${col(TAG_TABLE, 'lotId')}, ${col(TAG_TABLE, 'cause')}, ${col(TAG_TABLE, 'blueFlag')}, ${col(TAG_TABLE, 'owner')})
           VALUES (@lotId, @cause, @blueFlag, @owner)`,
          [
            { name: 'lotId', type: 'UniqueIdentifier', value: lotId },
            { name: 'cause', type: 'NVarChar', value: cause ?? '' },
            { name: 'blueFlag', type: 'Bit', value: Boolean(blueFlag) },
            { name: 'owner', type: 'NVarChar', value: userId },
          ],
        );
      }
    });

    return { lotId, cause, blueFlag };
  };

  const mapDetailLine = (row, warehouseByIdx, categoryByIdx) => {
    const warehouse = warehouseByIdx.get(toNumber(row.warehouseIdx));
    const category = categoryByIdx.get(toNumber(row.categoryIdx));
    return {
      id: row.id,
      goodsNo: row.goodsNo ?? '',
      itemName: row.itemName ?? '',
      categoryIdx: toNumber(row.categoryIdx),
      categoryZh: category ? category.nameZh : '',
      categoryEn: category ? category.nameEn : '',
      customerIdx: toNumber(row.customerIdx),
      customerName: row.customerName ?? '',
      warehouseIdx: toNumber(row.warehouseIdx),
      warehouseZh: warehouse ? warehouse.nameZh : (row.warehouseName ?? ''),
      warehouseEn: warehouse ? warehouse.nameEn : (row.warehouseName ?? ''),
      qty: toNumber(row.qty),
      unit: row.unit ?? '',
      usd: toNumber(row.usd),
      ageDays: toNumber(row.ageDays),
      batchNo: row.batchNo ?? '',
      lotDate: toDateString(row.lotDate),
      reasonWh: row.reasonWh ?? '',
      reasonDl: row.reasonDl ?? '',
    };
  };

  const buildDetailFilter = (filter) => {
    const clauses = [];
    const inputs = [];

    if (filter.cust !== undefined) {
      clauses.push(`${col(DETAIL_TABLE, 'customerIdx')} = @cust`);
      inputs.push({ name: 'cust', value: filter.cust });
    }
    if (filter.wh !== undefined) {
      clauses.push(`${col(DETAIL_TABLE, 'warehouseIdx')} = @wh`);
      inputs.push({ name: 'wh', value: filter.wh });
    }
    if (filter.cat !== undefined) {
      clauses.push(`${col(DETAIL_TABLE, 'categoryIdx')} = @cat`);
      inputs.push({ name: 'cat', value: filter.cat });
    }
    if (filter.age !== undefined) {
      const bounds = STOCK_AGE_BOUNDS[filter.age];
      if (bounds) {
        clauses.push(
          `${col(DETAIL_TABLE, 'ageDays')} >= @ageFrom AND ${col(DETAIL_TABLE, 'ageDays')} <= @ageTo`,
        );
        inputs.push({ name: 'ageFrom', value: bounds[0] });
        inputs.push({ name: 'ageTo', value: bounds[1] });
      }
    }
    if (filter.year) {
      const year = Number(filter.year);
      if (Number.isFinite(year)) {
        clauses.push(
          `${col(DETAIL_TABLE, 'lotDate')} >= CONVERT(date, @yearFrom) AND ${col(DETAIL_TABLE, 'lotDate')} <= CONVERT(date, @yearTo)`,
        );
        inputs.push({ name: 'yearFrom', type: 'NVarChar', value: `${year}-01-01` });
        inputs.push({ name: 'yearTo', type: 'NVarChar', value: `${year}-12-31` });
      }
    }
    if (filter.q) {
      clauses.push(
        `(LOWER(${col(DETAIL_TABLE, 'goodsNo')}) LIKE @term
          OR LOWER(${col(DETAIL_TABLE, 'itemName')}) LIKE @term
          OR LOWER(${col(DETAIL_TABLE, 'batchNo')}) LIKE @term
          OR LOWER(${col(DETAIL_TABLE, 'customerName')}) LIKE @term)`,
      );
      inputs.push({ name: 'term', type: 'NVarChar', value: `%${filter.q.trim().toLowerCase()}%` });
    }

    return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', inputs };
  };

  const queryDetailLines = async (filter) => {
    const meta = await loadMeta();
    const { where, inputs } = buildDetailFilter(filter);
    const page = filter.page && filter.page > 0 ? filter.page : 1;
    const pageSize = Math.min(
      filter.pageSize && filter.pageSize > 0 ? filter.pageSize : 25,
      MAX_INTERNAL_PAGE_SIZE,
    );
    const sortColumn =
      filter.sort === 'age'
        ? col(DETAIL_TABLE, 'ageDays')
        : filter.sort === 'qty'
          ? col(DETAIL_TABLE, 'qty')
          : col(DETAIL_TABLE, 'usd');
    const direction = filter.dir === 'asc' ? 'ASC' : 'DESC';

    const rowsResult = await db.query(
      `SELECT ${selectList(DETAIL_TABLE, DETAIL_COLUMNS)} FROM ${DETAIL_TABLE.name}
       ${where}
       ORDER BY ${sortColumn} ${direction}, ${col(DETAIL_TABLE, 'usd')} DESC
       OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
      [
        ...inputs,
        { name: 'offset', value: (page - 1) * pageSize },
        { name: 'pageSize', value: pageSize },
      ],
    );
    const totalResult = await db.query(
      `SELECT COUNT(1) AS total FROM ${DETAIL_TABLE.name} ${where}`,
      inputs,
    );
    const total = totalResult.recordset[0] ? toNumber(totalResult.recordset[0].total) : 0;

    const warehouseByIdx = new Map(meta.warehouses.map((item) => [item.idx, item]));
    const categoryByIdx = new Map(meta.categories.map((item) => [item.idx, item]));

    return {
      items: rowsResult.recordset.map((row) => mapDetailLine(row, warehouseByIdx, categoryByIdx)),
      total,
      page,
      pageSize,
    };
  };

  return {
    loadSnapshot,
    loadMeta,
    loadCube,
    readWipSummary,
    resolveReserveWarehouseIdx,
    computeReserveSummary,
    buildReserveDataset,
    buildWipDataset,
    loadWipTags,
    applyWipTags,
    upsertWipTag,
    queryDetailLines,
  };
};
