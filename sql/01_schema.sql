/*
 * Stock analysis — SQL Server schema (idempotent).
 * Run as a user allowed to create tables in the target database.
 *
 * Naming and column types mirror the application's logical model
 * (see selfhost/server/tables.js). If you map the app onto existing ERP/WMS
 * tables instead, keep this file only as the reference of what the API expects.
 */
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.stock_snapshot', N'U') IS NULL
CREATE TABLE dbo.stock_snapshot (
  id              uniqueidentifier NOT NULL CONSTRAINT df_stock_snapshot_id DEFAULT NEWID(),
  snapshot_date   date             NOT NULL,
  line_count      int              NOT NULL CONSTRAINT df_stock_snapshot_lines DEFAULT 0,
  sku_count       int              NOT NULL CONSTRAINT df_stock_snapshot_sku DEFAULT 0,
  total_usd       decimal(19, 4)   NOT NULL CONSTRAINT df_stock_snapshot_usd DEFAULT 0,
  total_qty       decimal(19, 4)   NOT NULL CONSTRAINT df_stock_snapshot_qty DEFAULT 0,
  detail_count    int              NOT NULL CONSTRAINT df_stock_snapshot_dcount DEFAULT 0,
  detail_usd      decimal(19, 4)   NOT NULL CONSTRAINT df_stock_snapshot_dusd DEFAULT 0,
  span_from       nvarchar(7)      NOT NULL,
  span_to         nvarchar(7)      NOT NULL,
  wip_summary     nvarchar(max)    NOT NULL CONSTRAINT df_stock_snapshot_wip DEFAULT N'{}',
  years           nvarchar(max)    NOT NULL CONSTRAINT df_stock_snapshot_years DEFAULT N'[]',
  _created_at     datetime2(3)     NOT NULL CONSTRAINT df_stock_snapshot_cat DEFAULT SYSUTCDATETIME(),
  _created_by     nvarchar(64)     NULL,
  _updated_at     datetime2(3)     NOT NULL CONSTRAINT df_stock_snapshot_uat DEFAULT SYSUTCDATETIME(),
  _updated_by     nvarchar(64)     NULL,
  CONSTRAINT pk_stock_snapshot PRIMARY KEY (id)
);
GO

IF OBJECT_ID(N'dbo.stock_warehouse', N'U') IS NULL
CREATE TABLE dbo.stock_warehouse (
  id          uniqueidentifier NOT NULL CONSTRAINT df_stock_warehouse_id DEFAULT NEWID(),
  idx         int              NOT NULL,
  name_zh     nvarchar(160)    NOT NULL,
  name_en     nvarchar(200)    NOT NULL,
  raw_name    nvarchar(240)    NOT NULL,
  total_usd   decimal(19, 4)   NOT NULL CONSTRAINT df_stock_warehouse_usd DEFAULT 0,
  _created_at datetime2(3)     NOT NULL CONSTRAINT df_stock_warehouse_cat DEFAULT SYSUTCDATETIME(),
  _created_by nvarchar(64)     NULL,
  _updated_at datetime2(3)     NOT NULL CONSTRAINT df_stock_warehouse_uat DEFAULT SYSUTCDATETIME(),
  _updated_by nvarchar(64)     NULL,
  CONSTRAINT pk_stock_warehouse PRIMARY KEY (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_stock_warehouse_idx')
  CREATE UNIQUE INDEX uq_stock_warehouse_idx ON dbo.stock_warehouse (idx);
GO

IF OBJECT_ID(N'dbo.stock_category', N'U') IS NULL
CREATE TABLE dbo.stock_category (
  id          uniqueidentifier NOT NULL CONSTRAINT df_stock_category_id DEFAULT NEWID(),
  idx         int              NOT NULL,
  name_zh     nvarchar(160)    NOT NULL,
  name_en     nvarchar(200)    NOT NULL,
  _created_at datetime2(3)     NOT NULL CONSTRAINT df_stock_category_cat DEFAULT SYSUTCDATETIME(),
  _created_by nvarchar(64)     NULL,
  _updated_at datetime2(3)     NOT NULL CONSTRAINT df_stock_category_uat DEFAULT SYSUTCDATETIME(),
  _updated_by nvarchar(64)     NULL,
  CONSTRAINT pk_stock_category PRIMARY KEY (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_stock_category_idx')
  CREATE UNIQUE INDEX uq_stock_category_idx ON dbo.stock_category (idx);
GO

IF OBJECT_ID(N'dbo.stock_customer', N'U') IS NULL
CREATE TABLE dbo.stock_customer (
  id          uniqueidentifier NOT NULL CONSTRAINT df_stock_customer_id DEFAULT NEWID(),
  idx         int              NOT NULL,
  name        nvarchar(120)    NOT NULL,
  _created_at datetime2(3)     NOT NULL CONSTRAINT df_stock_customer_cat DEFAULT SYSUTCDATETIME(),
  _created_by nvarchar(64)     NULL,
  _updated_at datetime2(3)     NOT NULL CONSTRAINT df_stock_customer_uat DEFAULT SYSUTCDATETIME(),
  _updated_by nvarchar(64)     NULL,
  CONSTRAINT pk_stock_customer PRIMARY KEY (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_stock_customer_idx')
  CREATE UNIQUE INDEX uq_stock_customer_idx ON dbo.stock_customer (idx);
GO

IF OBJECT_ID(N'dbo.stock_cube_cell', N'U') IS NULL
CREATE TABLE dbo.stock_cube_cell (
  id            uniqueidentifier NOT NULL CONSTRAINT df_stock_cube_cell_id DEFAULT NEWID(),
  customer_idx  int              NOT NULL,
  warehouse_idx int              NOT NULL,
  category_idx  int              NOT NULL,
  age_idx       int              NOT NULL,
  year_idx      int              NOT NULL,
  month_idx     int              NOT NULL,
  qty           decimal(19, 4)   NOT NULL CONSTRAINT df_stock_cube_cell_qty DEFAULT 0,
  usd           decimal(19, 4)   NOT NULL CONSTRAINT df_stock_cube_cell_usd DEFAULT 0,
  line_count    int              NOT NULL CONSTRAINT df_stock_cube_cell_lines DEFAULT 0,
  _created_at   datetime2(3)     NOT NULL CONSTRAINT df_stock_cube_cell_cat DEFAULT SYSUTCDATETIME(),
  _created_by   nvarchar(64)     NULL,
  _updated_at   datetime2(3)     NOT NULL CONSTRAINT df_stock_cube_cell_uat DEFAULT SYSUTCDATETIME(),
  _updated_by   nvarchar(64)     NULL,
  CONSTRAINT pk_stock_cube_cell PRIMARY KEY (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_stock_cube_cell_key')
  CREATE UNIQUE INDEX uq_stock_cube_cell_key
    ON dbo.stock_cube_cell (customer_idx, warehouse_idx, category_idx, age_idx, year_idx, month_idx);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_cube_cell_wh')
  CREATE INDEX idx_stock_cube_cell_wh ON dbo.stock_cube_cell (warehouse_idx);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_cube_cell_cust')
  CREATE INDEX idx_stock_cube_cell_cust ON dbo.stock_cube_cell (customer_idx);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_cube_cell_cat')
  CREATE INDEX idx_stock_cube_cell_cat ON dbo.stock_cube_cell (category_idx);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_cube_cell_age')
  CREATE INDEX idx_stock_cube_cell_age ON dbo.stock_cube_cell (age_idx);
GO

IF OBJECT_ID(N'dbo.stock_detail_line', N'U') IS NULL
CREATE TABLE dbo.stock_detail_line (
  id             uniqueidentifier NOT NULL CONSTRAINT df_stock_detail_line_id DEFAULT NEWID(),
  goods_no       nvarchar(32)     NOT NULL,
  item_name      nvarchar(400)    NOT NULL,
  category_idx   int              NOT NULL,
  customer_idx   int              NOT NULL,
  customer_name  nvarchar(120)    NOT NULL,
  warehouse_idx  int              NOT NULL,
  warehouse_name nvarchar(200)    NOT NULL,
  qty            decimal(19, 4)   NOT NULL CONSTRAINT df_stock_detail_line_qty DEFAULT 0,
  unit           nvarchar(16)     NOT NULL,
  usd            decimal(19, 4)   NOT NULL CONSTRAINT df_stock_detail_line_usd DEFAULT 0,
  age_days       int              NOT NULL CONSTRAINT df_stock_detail_line_age DEFAULT 0,
  batch_no       nvarchar(40)     NOT NULL,
  lot_date       date             NULL,
  reason_wh      nvarchar(120)    NOT NULL CONSTRAINT df_stock_detail_line_rwh DEFAULT N'',
  reason_dl      nvarchar(400)    NOT NULL CONSTRAINT df_stock_detail_line_rdl DEFAULT N'',
  month_idx      int              NOT NULL CONSTRAINT df_stock_detail_line_month DEFAULT 0,
  _created_at    datetime2(3)     NOT NULL CONSTRAINT df_stock_detail_line_cat DEFAULT SYSUTCDATETIME(),
  _created_by    nvarchar(64)     NULL,
  _updated_at    datetime2(3)     NOT NULL CONSTRAINT df_stock_detail_line_uat DEFAULT SYSUTCDATETIME(),
  _updated_by    nvarchar(64)     NULL,
  CONSTRAINT pk_stock_detail_line PRIMARY KEY (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_detail_line_wh')
  CREATE INDEX idx_stock_detail_line_wh ON dbo.stock_detail_line (warehouse_idx);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_detail_line_cust')
  CREATE INDEX idx_stock_detail_line_cust ON dbo.stock_detail_line (customer_idx);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_detail_line_cat')
  CREATE INDEX idx_stock_detail_line_cat ON dbo.stock_detail_line (category_idx);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_detail_line_age')
  CREATE INDEX idx_stock_detail_line_age ON dbo.stock_detail_line (age_days);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_detail_line_usd')
  CREATE INDEX idx_stock_detail_line_usd ON dbo.stock_detail_line (usd DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_stock_detail_line_month')
  CREATE INDEX idx_stock_detail_line_month ON dbo.stock_detail_line (month_idx);
GO

IF OBJECT_ID(N'dbo.wip_lot', N'U') IS NULL
CREATE TABLE dbo.wip_lot (
  id           uniqueidentifier NOT NULL CONSTRAINT df_wip_lot_id DEFAULT NEWID(),
  goods_no     nvarchar(32)     NOT NULL,
  item_name    nvarchar(400)    NOT NULL,
  customer_idx int              NOT NULL,
  qty          decimal(19, 4)   NOT NULL CONSTRAINT df_wip_lot_qty DEFAULT 0,
  unit         nvarchar(16)     NOT NULL,
  usd          decimal(19, 4)   NOT NULL CONSTRAINT df_wip_lot_usd DEFAULT 0,
  days_on_line int              NOT NULL CONSTRAINT df_wip_lot_days DEFAULT 0,
  batch_no     nvarchar(40)     NOT NULL,
  lot_date     date             NOT NULL,
  month_idx    int              NOT NULL CONSTRAINT df_wip_lot_month DEFAULT 0,
  _created_at  datetime2(3)     NOT NULL CONSTRAINT df_wip_lot_cat DEFAULT SYSUTCDATETIME(),
  _created_by  nvarchar(64)     NULL,
  _updated_at  datetime2(3)     NOT NULL CONSTRAINT df_wip_lot_uat DEFAULT SYSUTCDATETIME(),
  _updated_by  nvarchar(64)     NULL,
  CONSTRAINT pk_wip_lot PRIMARY KEY (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_wip_lot_days')
  CREATE INDEX idx_wip_lot_days ON dbo.wip_lot (days_on_line);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_wip_lot_cust')
  CREATE INDEX idx_wip_lot_cust ON dbo.wip_lot (customer_idx);
GO

IF OBJECT_ID(N'dbo.wip_lot_tag', N'U') IS NULL
CREATE TABLE dbo.wip_lot_tag (
  id          uniqueidentifier NOT NULL CONSTRAINT df_wip_lot_tag_id DEFAULT NEWID(),
  lot_id      uniqueidentifier NOT NULL,
  cause       nvarchar(24)     NOT NULL CONSTRAINT df_wip_lot_tag_cause DEFAULT N'',
  blue_flag   bit              NOT NULL CONSTRAINT df_wip_lot_tag_blue DEFAULT 0,
  owner       nvarchar(64)     NOT NULL,
  _created_at datetime2(3)     NOT NULL CONSTRAINT df_wip_lot_tag_cat DEFAULT SYSUTCDATETIME(),
  _created_by nvarchar(64)     NULL,
  _updated_at datetime2(3)     NOT NULL CONSTRAINT df_wip_lot_tag_uat DEFAULT SYSUTCDATETIME(),
  _updated_by nvarchar(64)     NULL,
  CONSTRAINT pk_wip_lot_tag PRIMARY KEY (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_wip_lot_tag_owner')
  CREATE UNIQUE INDEX uq_wip_lot_tag_owner ON dbo.wip_lot_tag (lot_id, owner);
GO

IF OBJECT_ID(N'dbo.dataset_cache', N'U') IS NULL
CREATE TABLE dbo.dataset_cache (
  cache_key   nvarchar(40)   NOT NULL,
  payload     nvarchar(max)  NOT NULL,
  source      nvarchar(24)   NOT NULL CONSTRAINT df_dataset_cache_source DEFAULT N'snapshot',
  fetched_at  datetime2(3)   NOT NULL CONSTRAINT df_dataset_cache_fetched DEFAULT SYSUTCDATETIME(),
  expires_at  datetime2(3)   NOT NULL CONSTRAINT df_dataset_cache_expires DEFAULT SYSUTCDATETIME(),
  item_count  int            NOT NULL CONSTRAINT df_dataset_cache_items DEFAULT 0,
  build_ms    int            NOT NULL CONSTRAINT df_dataset_cache_build DEFAULT 0,
  _created_at datetime2(3)   NOT NULL CONSTRAINT df_dataset_cache_cat DEFAULT SYSUTCDATETIME(),
  _created_by nvarchar(64)   NULL,
  _updated_at datetime2(3)   NOT NULL CONSTRAINT df_dataset_cache_uat DEFAULT SYSUTCDATETIME(),
  _updated_by nvarchar(64)   NULL,
  CONSTRAINT pk_dataset_cache PRIMARY KEY (cache_key)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_dataset_cache_expires')
  CREATE INDEX idx_dataset_cache_expires ON dbo.dataset_cache (expires_at);
GO

IF OBJECT_ID(N'dbo.source_fetch_log', N'U') IS NULL
CREATE TABLE dbo.source_fetch_log (
  id          uniqueidentifier NOT NULL CONSTRAINT df_source_fetch_log_id DEFAULT NEWID(),
  endpoint    nvarchar(160)    NOT NULL,
  method      nvarchar(8)      NOT NULL CONSTRAINT df_source_fetch_log_method DEFAULT N'GET',
  outcome     nvarchar(24)     NOT NULL,
  http_status int              NULL,
  duration_ms int              NOT NULL CONSTRAINT df_source_fetch_log_duration DEFAULT 0,
  message     nvarchar(400)    NOT NULL,
  _created_at datetime2(3)     NOT NULL CONSTRAINT df_source_fetch_log_cat DEFAULT SYSUTCDATETIME(),
  _created_by nvarchar(64)     NULL,
  _updated_at datetime2(3)     NOT NULL CONSTRAINT df_source_fetch_log_uat DEFAULT SYSUTCDATETIME(),
  _updated_by nvarchar(64)     NULL,
  CONSTRAINT pk_source_fetch_log PRIMARY KEY (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_source_fetch_log_created')
  CREATE INDEX idx_source_fetch_log_created ON dbo.source_fetch_log (_created_at DESC);
GO
