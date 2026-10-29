export const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pad2 = (value) => String(value).padStart(2, '0');

/** SQL Server date/datetime2 -> 'YYYY-MM-DD'; null stays null. */
export const toDateString = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getUTCFullYear();
    const month = pad2(value.getUTCMonth() + 1);
    const day = pad2(value.getUTCDate());
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
};

export const toIsoString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const monthRange = (from, to) => {
  const [fromYear, fromMonth] = String(from ?? '')
    .split('-')
    .map(Number);
  const [toYear, toMonth] = String(to ?? '')
    .split('-')
    .map(Number);
  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) return [];
  const months = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
    months.push(`${year}-${pad2(month)}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (months.length > 480) break;
  }
  return months;
};

export const parseJson = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

export const readStringArray = (value) => {
  const parsed = parseJson(value, null);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item) => typeof item === 'string');
};

export const monthsOnHand = (monthIdx, snapshotIdx) =>
  monthIdx < 0 ? 0 : Math.max(0, snapshotIdx - monthIdx);

export const clampInt = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
};
