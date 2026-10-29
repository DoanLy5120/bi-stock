/*
 * Post-import sanity check. Every column must exist and the numbers must agree.
 * Run after creating the schema and loading your data.
 */
SET NOCOUNT ON;
GO

/* 1. Row counts */
SELECT 'stock_snapshot' AS table_name, COUNT(*) AS rows_count FROM dbo.stock_snapshot
UNION ALL SELECT 'stock_warehouse', COUNT(*) FROM dbo.stock_warehouse
UNION ALL SELECT 'stock_category', COUNT(*) FROM dbo.stock_category
UNION ALL SELECT 'stock_customer', COUNT(*) FROM dbo.stock_customer
UNION ALL SELECT 'stock_cube_cell', COUNT(*) FROM dbo.stock_cube_cell
UNION ALL SELECT 'stock_detail_line', COUNT(*) FROM dbo.stock_detail_line
UNION ALL SELECT 'wip_lot', COUNT(*) FROM dbo.wip_lot
UNION ALL SELECT 'wip_lot_tag', COUNT(*) FROM dbo.wip_lot_tag
UNION ALL SELECT 'dataset_cache', COUNT(*) FROM dbo.dataset_cache
UNION ALL SELECT 'source_fetch_log', COUNT(*) FROM dbo.source_fetch_log;
GO

/* 2. Exactly one snapshot row is expected (the API reads TOP 1) */
SELECT TOP 5 snapshot_date, span_from, span_to, line_count, sku_count, total_usd, detail_count
FROM dbo.stock_snapshot
ORDER BY snapshot_date DESC;
GO

/* 3. Cube total must match the snapshot header */
SELECT
  s.snapshot_date,
  s.total_usd                       AS snapshot_usd,
  (SELECT SUM(usd) FROM dbo.stock_cube_cell)  AS cube_usd,
  (SELECT COUNT(*) FROM dbo.stock_cube_cell)  AS cube_cells
FROM dbo.stock_snapshot s;
GO

/* 4. Reserve warehouse must be present (the reserve view picks it by name) */
SELECT idx, name_zh, name_en, raw_name, total_usd
FROM dbo.stock_warehouse
ORDER BY idx;
GO

/* 5. Referential sanity: cube indexes must exist in the dimension tables */
SELECT
  (SELECT COUNT(*) FROM dbo.stock_cube_cell c
     WHERE NOT EXISTS (SELECT 1 FROM dbo.stock_customer x WHERE x.idx = c.customer_idx)) AS orphan_customers,
  (SELECT COUNT(*) FROM dbo.stock_cube_cell c
     WHERE NOT EXISTS (SELECT 1 FROM dbo.stock_warehouse x WHERE x.idx = c.warehouse_idx)) AS orphan_warehouses,
  (SELECT COUNT(*) FROM dbo.stock_cube_cell c
     WHERE NOT EXISTS (SELECT 1 FROM dbo.stock_category x WHERE x.idx = c.category_idx)) AS orphan_categories;
GO

/* 6. Age buckets must be 0..5 (the API sends ageIdx 0..5) */
SELECT age_idx, COUNT(*) AS cells FROM dbo.stock_cube_cell GROUP BY age_idx ORDER BY age_idx;
GO

/* 7. WIP summary payload must be valid JSON (the API parses it) */
SELECT TOP 1 ISJSON(wip_summary) AS wip_summary_is_json, ISJSON(years) AS years_is_json
FROM dbo.stock_snapshot;
GO

/* 8. Detail rows feed the register: check the reason columns are filled */
SELECT
  COUNT(*) AS lines_without_reason,
  SUM(CASE WHEN reason_dl = N'' THEN 1 ELSE 0 END) AS empty_reason_dl
FROM dbo.stock_detail_line
WHERE reason_wh = N'';
GO
