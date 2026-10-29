-- HORA website — D1 (hora-core) schema cho tai khoan khach, don hang, thanh toan.
-- Ap dung: npx wrangler d1 execute hora-core --remote --file db/schema.sql
-- (chay ban --local truoc khi test o may). Cac lenh deu idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- PBKDF2-SHA256, base64; KHONG bao gio luu mat khau tho
  salt          TEXT NOT NULL,          -- base64, random 16 bytes / khach
  iterations    INTEGER NOT NULL DEFAULT 100000,
  display_name  TEXT,
  created_at    TEXT NOT NULL           -- ISO 8601 UTC
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,         -- SHA-256 cua token; token tho chi nam trong cookie
  customer_id TEXT NOT NULL REFERENCES customers(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON sessions(customer_id);

CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,         -- dang HORA-<time36>-<random6>
  customer_id TEXT NOT NULL REFERENCES customers(id),
  plan        TEXT NOT NULL,            -- 'go' | 'plus'
  period      TEXT NOT NULL,            -- 'month' | 'year'
  amount_vnd  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'created',
  -- created -> awaiting_payment -> paid | paid_pending_issue | payment_failed
  gateway     TEXT,                     -- 'sepay' | 'momo' | 'vnpay'
  created_at  TEXT NOT NULL,
  paid_at     TEXT,
  license_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

CREATE TABLE IF NOT EXISTS payments (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id),
  gateway          TEXT NOT NULL,       -- 'sepay' | 'momo' | 'vnpay'
  gateway_order_id TEXT,                -- SePay ma thanh toan / MoMo orderId / VNPay vnp_TxnRef
  gateway_trans_id TEXT,                -- SePay transaction id / MoMo transId / VNPay vnp_TransactionNo
  amount_vnd       INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'initiated',  -- initiated | paid | failed | amount_mismatch
  raw_json         TEXT,                -- payload IPN gan nhat (da xac minh chu ky)
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS customer_licenses (
  id                TEXT PRIMARY KEY,
  customer_id       TEXT NOT NULL REFERENCES customers(id),
  license_key_hash  TEXT NOT NULL,      -- SHA-256 cua key; key tho cua claim KHONG luu
  -- Chi key do he thong cap qua mua tren web moi luu ban tho de khach tu copy
  -- trong dashboard cua chinh ho (xem docs/customer-accounts.md, muc bao mat).
  license_key_plain TEXT,
  product           TEXT,               -- NULL neu chua biet (key claim)
  tier              TEXT,               -- NULL = chua dong bo
  expires_at        TEXT,
  source            TEXT NOT NULL CHECK (source IN ('purchase','claim')),
  order_id          TEXT REFERENCES orders(id),
  created_at        TEXT NOT NULL,
  UNIQUE (customer_id, license_key_hash)
);
CREATE INDEX IF NOT EXISTS idx_licenses_customer ON customer_licenses(customer_id);
