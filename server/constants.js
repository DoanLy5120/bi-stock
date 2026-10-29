export const MEMO_TTL_MS = 60_000;
export const MAX_INTERNAL_PAGE_SIZE = 5_000;
export const RISK_BAND_START = 2;
export const RECENT_CALL_LIMIT = 10;
export const LOG_RETENTION_DAYS = 7;
export const DEFAULT_DETAIL_PAGE_SIZE = 25;

export const STOCK_AGE_BOUNDS = [
  [0, 30],
  [31, 60],
  [61, 90],
  [91, 180],
  [181, 365],
  [366, 100000],
];

export const STOCK_AGE_LABELS = ['0–30', '31–60', '61–90', '91–180', '181–365', '365+'];

export const STOCK_CACHE_KEYS = ['reserve', 'wip'];

export const STOCK_CACHE_LABELS = {
  reserve: 'Reserve dataset',
  wip: 'WIP dataset',
};

export const isStockCacheKey = (value) =>
  typeof value === 'string' && STOCK_CACHE_KEYS.includes(value);

export const STOCK_DETAIL_SORTS = ['usd', 'age', 'qty'];

export const isStockDetailSort = (value) =>
  typeof value === 'string' && STOCK_DETAIL_SORTS.includes(value);

export const WIP_CAUSE_KEYS = ['bom', 'over', 'scrap', 'quality', 'delay'];

export const isWipCause = (value) =>
  typeof value === 'string' && WIP_CAUSE_KEYS.includes(value);

export const RESERVE_BAND_DEFS = [
  { key: 'lt3', labelZh: '3个月内', labelEn: '< 3 months', fromMonth: 0, toMonth: 3 },
  { key: 'm3', labelZh: '3至6个月', labelEn: '3–6 months', fromMonth: 3, toMonth: 6 },
  { key: 'm6', labelZh: '6至9个月', labelEn: '6–9 months', fromMonth: 6, toMonth: 9 },
  { key: 'm9', labelZh: '9至12个月', labelEn: '9–12 months', fromMonth: 9, toMonth: 12 },
  { key: 'gte12', labelZh: '12个月以上', labelEn: '≥ 12 months', fromMonth: 12, toMonth: 999 },
];

export const RESERVE_BIN_DEFS = [
  { label: '0–1 mo', fromMonth: 0, toMonth: 1 },
  { label: '1–2 mo', fromMonth: 1, toMonth: 2 },
  { label: '2–3 mo', fromMonth: 2, toMonth: 3 },
  { label: '3–6 mo', fromMonth: 3, toMonth: 6 },
  { label: '6–9 mo', fromMonth: 6, toMonth: 9 },
  { label: '9–12 mo', fromMonth: 9, toMonth: 12 },
  { label: '12+ mo', fromMonth: 12, toMonth: 999 },
];

export const reserveBandIndex = (months) => {
  const value = Math.max(0, months);
  for (let index = 0; index < RESERVE_BAND_DEFS.length; index += 1) {
    const band = RESERVE_BAND_DEFS[index];
    if (value >= band.fromMonth && value < band.toMonth) return index;
  }
  return RESERVE_BAND_DEFS.length - 1;
};
