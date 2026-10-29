/*
 * Single place to remap the app onto your own SQL Server tables.
 * Left side  = logical name used by the services (do not rename).
 * Right side = physical column name in SQL Server (edit freely).
 *
 * Example: if your stock lives in `WMS_StockLines`, change
 *   detailLine.name  -> 'WMS_StockLines'
 * and point each column at the real column of that view/table.
 */
const table = (name, cols) => ({ name, cols });

export const TABLES = {
  snapshot: table('stock_snapshot', {
    id: 'id',
    snapshotDate: 'snapshot_date',
    lineCount: 'line_count',
    skuCount: 'sku_count',
    totalUsd: 'total_usd',
    totalQty: 'total_qty',
    detailCount: 'detail_count',
    detailUsd: 'detail_usd',
    spanFrom: 'span_from',
    spanTo: 'span_to',
    wipSummary: 'wip_summary',
    years: 'years',
  }),

  warehouse: table('stock_warehouse', {
    idx: 'idx',
    nameZh: 'name_zh',
    nameEn: 'name_en',
    rawName: 'raw_name',
    totalUsd: 'total_usd',
  }),

  category: table('stock_category', {
    idx: 'idx',
    nameZh: 'name_zh',
    nameEn: 'name_en',
  }),

  customer: table('stock_customer', {
    idx: 'idx',
    name: 'name',
  }),

  cubeCell: table('stock_cube_cell', {
    customerIdx: 'customer_idx',
    warehouseIdx: 'warehouse_idx',
    categoryIdx: 'category_idx',
    ageIdx: 'age_idx',
    yearIdx: 'year_idx',
    monthIdx: 'month_idx',
    qty: 'qty',
    usd: 'usd',
    lines: 'line_count',
  }),

  detailLine: table('stock_detail_line', {
    id: 'id',
    goodsNo: 'goods_no',
    itemName: 'item_name',
    categoryIdx: 'category_idx',
    customerIdx: 'customer_idx',
    customerName: 'customer_name',
    warehouseIdx: 'warehouse_idx',
    warehouseName: 'warehouse_name',
    qty: 'qty',
    unit: 'unit',
    usd: 'usd',
    ageDays: 'age_days',
    batchNo: 'batch_no',
    lotDate: 'lot_date',
    reasonWh: 'reason_wh',
    reasonDl: 'reason_dl',
    monthIdx: 'month_idx',
  }),

  wipLot: table('wip_lot', {
    id: 'id',
    goodsNo: 'goods_no',
    itemName: 'item_name',
    customerIdx: 'customer_idx',
    qty: 'qty',
    unit: 'unit',
    usd: 'usd',
    days: 'days_on_line',
    batchNo: 'batch_no',
    lotDate: 'lot_date',
    monthIdx: 'month_idx',
  }),

  wipLotTag: table('wip_lot_tag', {
    id: 'id',
    lotId: 'lot_id',
    cause: 'cause',
    blueFlag: 'blue_flag',
    owner: 'owner',
  }),

  datasetCache: table('dataset_cache', {
    cacheKey: 'cache_key',
    payload: 'payload',
    source: 'source',
    fetchedAt: 'fetched_at',
    expiresAt: 'expires_at',
    itemCount: 'item_count',
    buildMs: 'build_ms',
  }),

  sourceFetchLog: table('source_fetch_log', {
    id: 'id',
    endpoint: 'endpoint',
    method: 'method',
    outcome: 'outcome',
    httpStatus: 'http_status',
    durationMs: 'duration_ms',
    message: 'message',
    createdAt: '_created_at',
  }),
};

export const col = (tableDef, logical) => {
  const physical = tableDef.cols[logical];
  if (!physical) throw new Error(`Unknown column ${logical} on ${tableDef.name}`);
  return physical;
};

export const selectList = (tableDef, logicalKeys) =>
  logicalKeys
    .map((logical) => `${col(tableDef, logical)} AS ${logical}`)
    .join(', ');
