# Phân tích tồn kho — bản tự triển khai (Node.js + SQL Server)

Bản độc lập của ứng dụng tồn kho Germton: **Node.js (Express, JavaScript) + SQL Server** ở phía server,
**React (Vite) đóng gói sẵn** ở phía client. Toàn bộ thứ cần tải về máy nằm trong thư mục `selfhost/` —
không phụ thuộc, không import gì từ ứng dụng Miaoda ở thư mục gốc repo.

## Khác biệt so với bản chạy trên nền tảng

| Hạng mục | Bản trên Miaoda | Bản tự triển khai (`selfhost/`) |
| --- | --- | --- |
| Nguồn dữ liệu | Proxy sang hệ thống nguồn, fallback snapshot | Truy vấn trực tiếp SQL Server |
| Server | NestJS + Drizzle + PostgreSQL | Express + `mssql`, không ORM |
| Client | Nguyên bản trong `client/` | Bản sao đầy đủ trong `selfhost/client/` (Vite riêng) |
| Đăng nhập | Có (nền tảng) | Không — mọi route mở, tag WIP dùng chung 1 owner |
| Triển khai | Preview / release của nền tảng | PM2 (`stock-api`) sau nginx |
| Cache | RAM + bảng `dataset_cache` | Giống hệt |

Giao diện ba màn hình (Tổng quan / WIP / Kho lưu) và trang `/api-console` giữ nguyên bản thiết kế gốc.

## Cấu trúc thư mục

```
selfhost/
├── client/                     Ứng dụng React độc lập (Vite + Tailwind v4)
│   ├── package.json            react, react-router, react-query, lucide, radix-slot…
│   ├── vite.config.ts          alias @ → src, @shared → src/shared, proxy /api khi dev
│   ├── index.html
│   └── src/
│       ├── main.tsx            entry: QueryClient + Router (không cần SDK nền tảng)
│       ├── app.tsx             4 route: / , /wip , /reserve , /api-console
│       ├── index.css           Tailwind + token theme
│       ├── api/stock.ts        client gọi API (fetch), getStockErrorMessage
│       ├── shared/
│       │   └── api.interface.ts  toàn bộ type/const dùng chung với server
│       ├── lib/utils.ts        cn()
│       ├── components/ui/      button, badge, card, table, skeleton, spinner
│       └── pages/
│           ├── stock/          views, components, hooks, lib, stock.css
│           ├── ApiConsole/     trang trạng thái proxy/cache
│           └── NotFound/
├── server/                     API Express (ESM, không build)
│   ├── index.js                app + /api/health + log + static (tuỳ chọn)
│   ├── config.js               đọc .env
│   ├── db.js                   pool mssql, query()/transaction() có tham số kiểu
│   ├── errors.js               HttpError 400/404/500, error handler
│   ├── constants.js            band tuổi tồn, cache key, lý do WIP, band/bin kho lưu
│   ├── tables.js               ⚠️ nơi map tên bảng/cột thật của bạn
│   ├── util/format.js          số, ngày, khoảng tháng, JSON
│   ├── services/dataset.js     đọc meta/cube/detail, tính kho lưu + WIP, upsert tag
│   ├── services/cache.js       cache 2 tầng + log build vào source_fetch_log
│   ├── services/query.js       điều phối request + validate tham số
│   └── routes/stock.js         7 endpoint /api/stock/*
├── sql/01_schema.sql           DDL 10 bảng (chạy lại nhiều lần vẫn an toàn)
├── sql/02_verify.sql           kiểm tra sau khi nạp dữ liệu
├── deploy/nginx.conf           phục vụ SPA + proxy /api
├── ecosystem.config.cjs        định nghĩa PM2
├── test/logic.test.mjs         17 test logic, không cần SQL Server, không cần npm i
├── .env.example
└── README.md                   (tệp này)
```

## Yêu cầu

- Node.js 20 trở lên (khuyến nghị 22) trên máy build và máy chủ
- SQL Server 2017+ (Express cũng được), login có quyền đọc bảng tồn kho và ghi 3 bảng
  `dataset_cache`, `source_fetch_log`, `wip_lot_tag`
- nginx (phục vụ file tĩnh + proxy `/api`)
- PM2: `npm i -g pm2`

## Triển khai

Quy ước trong tài liệu: copy thư mục `selfhost/` lên máy chủ thành `/var/www/stock`
(tức `/var/www/stock/client`, `/var/www/stock/server`, …). Đổi đường dẫn nếu bạn muốn.

### 1. Build client

```bash
cd selfhost/client
npm install           # lần đầu, tạo package-lock.json (commit lại nếu muốn dùng npm ci)
npm run build         # tạo selfhost/client/dist
```

Muốn thử giao diện trên máy dev: chạy API trước (`npm start` trong `selfhost/`), rồi `npm run dev`
trong `selfhost/client` — Vite proxy `/api` sang `http://127.0.0.1:3000`.

### 2. Đưa mã lên máy chủ

```bash
rsync -a --exclude node_modules --exclude dist --exclude .env selfhost/ /var/www/stock/
rsync -a selfhost/client/dist/ /var/www/stock/client/dist/
cd /var/www/stock && npm install --omit=dev && cp .env.example .env && vi .env
node test/logic.test.mjs    # tuỳ chọn, không cần database
```

### 3. Tạo schema và nạp dữ liệu

```bash
sqlcmd -S "$DB_SERVER" -U "$DB_USER" -P "$DB_PASSWORD" -d "$DB_NAME" -i sql/01_schema.sql
# nạp dữ liệu tồn kho: BCP / SSIS / bảng staging rồi INSERT ... SELECT
sqlcmd -S "$DB_SERVER" -U "$DB_USER" -P "$DB_PASSWORD" -d "$DB_NAME" -i sql/02_verify.sql
```

`01_schema.sql` chạy lại nhiều lần không lỗi. `02_verify.sql` in số dòng từng bảng và các phép đối chiếu
(tổng cube so với header snapshot, index mồ côi ở bảng chiều, bucket tuổi 0–5, payload JSON hợp lệ, cột
lý do bị rỗng). Sửa hết cảnh báo trước khi chạy API.

### 4. Chạy API bằng PM2

```bash
cd /var/www/stock
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup        # chạy lệnh mà PM2 in ra để tự khởi động cùng máy
curl -s localhost:3000/api/health   # {"status":"ok","time":"..."}
```

### 5. Cấu hình nginx

Copy `deploy/nginx.conf` vào `/etc/nginx/conf.d/stock.conf`, sửa `server_name` và `root` nếu khác
`/var/www/stock/client/dist`, sau đó:

```bash
nginx -t && systemctl reload nginx
```

Chỉ cần reload nginx (không cần restart API) khi deploy lại client: `index.html` gửi kèm `no-store`,
còn `/assets/*` có hash nên cache 30 ngày.

## Cấu hình `.env`

| Biến | Ý nghĩa |
| --- | --- |
| `PORT` | Cổng API, mặc định `3000` |
| `HOST` | Địa chỉ lắng nghe, mặc định `127.0.0.1` (chỉ nginx gọi được) |
| `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Kết nối SQL Server |
| `DB_INSTANCE` | Tên instance (nếu dùng named instance) |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | TLS. Có chứng chỉ hợp lệ: `true` / `false` |
| `DB_POOL_MAX` | Số kết nối tối đa, mặc định 10 |
| `STOCK_SOURCE_CACHE_TTL_SECONDS` | TTL cache dataset, 30–86400, mặc định 300 |
| `STOCK_SOURCE_TIMEOUT_MS` | Timeout truy vấn, 1000–30000, mặc định 8000 |
| `WIP_TAG_OWNER` | Owner ghi vào mọi tag WIP (vì không có đăng nhập) |
| `SERVE_STATIC`, `CLIENT_DIST` | Cho Express phục vụ luôn `dist` (mặc định `false`, để nginx lo) |

Hai biến `STOCK_SOURCE_*` giữ nguyên tên từ bản nền tảng vì trang `/api-console` hiển thị đúng tên này.

## Map bảng dữ liệu

`server/tables.js` là nơi duy nhất biết tên vật lý. Mỗi khoá logic (bên trái) ánh xạ sang tên cột thật
(bên phải); `selectList()` sinh `cột_thật AS khoá_logic` nên phần còn lại của code và JSON trả về không đổi.

```js
const table = (name, cols) => ({ name, cols });

export const TABLES = {
  detailLine: table('stock_detail_line', {
    id: 'id',
    goodsNo: 'goods_no',
    // ... mỗi dòng ứng với một cột mà API đọc
  }),
};
```

10 khoá logic **không được đổi tên**: `snapshot`, `warehouse`, `category`, `customer`, `cubeCell`,
`detailLine`, `wipLot`, `wipLotTag`, `datasetCache`, `sourceFetchLog`. Chỉ đổi tên bảng và tên cột.

Khi map sang bảng ERP/WMS có sẵn:

1. Sửa tên bảng và các chuỗi tên cột (dùng được tên có schema: `dbo.ItemMaster`).
2. Mọi cột được khai báo phải tồn tại — API alias sang camelCase, thiếu cột là lỗi SQL chứ không phải ô trống.
3. Giữ đúng ngữ nghĩa từng cột (xem chú thích trong `tables.js`): `ageDays` = số ngày tồn, `monthIdx` =
   số tháng nằm trong kho lưu, `yearIdx`/`monthIdx` trên cube là chỉ số trong khoảng `spanFrom`–`spanTo`
   của snapshot.
4. Chỉ 3 bảng bị ghi: `dataset_cache`, `source_fetch_log`, `wip_lot_tag` — cần INSERT/UPDATE (và DELETE
   cho job dọn log).
5. Có thể tạo view mang đúng tên logic rồi trỏ `TABLES` vào view, không cần đụng bảng gốc.

Lưu ý thêm: màn hình kho lưu chọn kho theo regex `/reserve\s+materials/i` trên `raw_name` hoặc `name_en`
(hàm `resolveReserveWarehouseIdx` trong `server/services/dataset.js`), không khớp thì lấy `idx = 0`.
Nếu tên kho của bạn khác, sửa regex hoặc trả về chỉ số cố định.

## API

Không có xác thực; mọi route đều mở. Prefix `/api/stock` do nginx chuyển tiếp nguyên vẹn.

| Method + path | Chức năng |
| --- | --- |
| `GET /api/health` | kiểm tra sống (không truy vấn database) |
| `GET /api/stock/overview` | meta + cube + WIP summary + tổng hợp kho lưu |
| `GET /api/stock/detail` | chi tiết phân trang — `cust`, `wh`, `cat`, `age`, `year`, `q`, `sort=usd\|age\|qty`, `dir`, `page`, `pageSize` (tối đa 100) |
| `GET /api/stock/reserve` | band tuổi kho lưu, histogram, buyer, danh sách dòng chi tiết |
| `GET /api/stock/wip` | WIP summary + danh sách lot kèm tag |
| `GET /api/stock/source/status` | trạng thái cấu hình, cache từng dataset, các lần build gần nhất |
| `POST /api/stock/cache/refresh` | body `{ "keys": ["reserve","wip"] }` — build lại, báo lỗi theo từng key |
| `PUT /api/stock/wip/lots/:id/tag` | body `{ "cause": "quality"\|null, "blueFlag": true }` |

```bash
curl -s localhost:3000/api/stock/overview | head -c 300
curl -s 'localhost:3000/api/stock/detail?wh=3&sort=usd&dir=desc&page=1&pageSize=10'
curl -s -X PUT localhost:3000/api/stock/wip/lots/<lotId>/tag \
     -H 'content-type: application/json' -d '{"cause":"quality","blueFlag":true}'
```

Lỗi luôn cùng một dạng: `{ "error": { "code": "BAD_REQUEST", "message": "..." } }` — 400 khi tham số sai,
404 khi không có lot, 500 khi lỗi ngoài dự kiến (message chung, chi tiết nằm trong log).

## Cache và log

- Hai tầng: `Map` trong tiến trình (mỗi instance PM2) và bảng `dataset_cache`, nên restart hoặc chạy nhiều
  instance vẫn dùng lại bản build cũ.
- Dataset `reserve` và `wip` được build khi có request rồi cache theo `STOCK_SOURCE_CACHE_TTL_SECONDS`.
- `cache.origin` luôn là `snapshot` (không còn hệ thống nguồn) — đúng như banner trên `/api-console`.
- Mỗi lần build ghi 1 dòng vào `source_fetch_log` (`endpoint`, `outcome`, `duration_ms`, `message`) và xoá
  dòng cũ hơn ~7 ngày. Bảng "recent calls" trên console hiển thị 20 dòng mới nhất.

## Vận hành

```bash
pm2 status
pm2 logs stock-api --lines 100
pm2 restart stock-api     # sau khi sửa .env hoặc code server
pm2 reload stock-api      # restart êm
```

- Log: `selfhost/logs/out.log`, `selfhost/logs/error.log` (PM2) và log từng request do app in ra
  (`method path status ms`).
- `/api/health` trả 200 mà không chạm SQL Server — dùng cho load balancer và smoke test.
  `/api/stock/source/status` mới là chỗ xác nhận đọc được database.
- Rollback: `pm2 stop stock-api` và trỏ `root` của nginx về bản `dist/` trước đó. Database chỉ bị ghi ở 3
  bảng nêu trên nên rollback không cần migrate dữ liệu.

## Cập nhật giao diện về sau

`selfhost/client/src/pages/stock` là bản sao của `client/src/pages/stock` (giữ nguyên alias `@/` và
`@shared/`). Khi sửa UI ở ứng dụng gốc, copy lại thư mục tương ứng sang `selfhost/client/src` rồi
`npm run build` — không cần sửa import. Hai file luôn phải là bản riêng của `selfhost`: `src/main.tsx`
(khởi tạo Router/QueryClient) và `src/api/stock.ts` (gọi API bằng `fetch`, không dùng SDK nền tảng).

## Kiểm tra sau triển khai

1. `node test/logic.test.mjs` → `17/17 checks passed` (hoặc `npm run test:logic`).
2. `sql/02_verify.sql` → không index mồ côi, tổng cube khớp header snapshot, `wip_summary` có `ISJSON = 1`.
3. `curl localhost:3000/api/health` → `{"status":"ok",...}`.
4. Mở `/` → số liệu tổng quan hiện; `/wip` → lưu tag rồi F5 vẫn còn; `/reserve` → bảng chi tiết phân trang;
   `/api-console` → banner `configured: false`, 2 dataset, bấm Refresh thấy build mới trong recent calls.


//đang dùng logic.test.mjs để test