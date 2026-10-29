//call dữ liệu test

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

export const wipLotRows = [
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

export const makeDb = (overrides = {}) => {
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