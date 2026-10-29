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
  email_verified_at TEXT,               -- NULL = chua xac thuc email; ISO 8601 UTC khi da xac thuc
  created_at    TEXT NOT NULL           -- ISO 8601 UTC
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,         -- SHA-256 cua token; token tho chi nam trong cookie
  customer_id TEXT NOT NULL REFERENCES customers(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON sessions(customer_id);

-- Token dung 1 lan cho xac thuc email + dat lai mat khau (chi luu SHA-256).
-- Token tho chi xuat hien trong link gui qua email, khong bao gio luu/log.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  purpose     TEXT NOT NULL,            -- 'verify_email' | 'reset_password'
  token_hash  TEXT NOT NULL UNIQUE,     -- SHA-256 cua token tho
  expires_at  TEXT NOT NULL,            -- ISO 8601 UTC
  used_at     TEXT,                     -- NULL = chua dung; set khi da dung/bi huy
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_customer ON auth_tokens(customer_id);

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

-- ===========================================================================
-- Web la Identity Provider cho cac app desktop (Video Builder, Facebook...).
-- App KHONG giu user/password: web phat mot ma dinh danh (token opaque), app
-- giu token do va goi lai web de verify + lay license/plan.
-- ===========================================================================

-- Phien "ket noi app": web hien ma (code) cho khach, khach dua ma cho app,
-- app goi /api/identity/link-claim de doi lay userId + token.
CREATE TABLE IF NOT EXISTS app_links (
  code        TEXT PRIMARY KEY,         -- ma ngan (vd HORA-LINK-AB12CD), dung 1 lan
  customer_id TEXT NOT NULL REFERENCES customers(id),
  app         TEXT NOT NULL,            -- 'video-builder' | 'facebook-builder' | ...
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | claimed | expired
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  claimed_at  TEXT,
  device_id   TEXT                      -- deviceId app gui kem khi claim
);
CREATE INDEX IF NOT EXISTS idx_app_links_customer ON app_links(customer_id);

-- Token app giu sau khi link. Chi luu SHA-256; revoke bang revoked_at.
CREATE TABLE IF NOT EXISTS app_tokens (
  token_hash  TEXT PRIMARY KEY,         -- sha256(token)
  customer_id TEXT NOT NULL REFERENCES customers(id),
  app         TEXT NOT NULL,
  device_id   TEXT,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_tokens_customer ON app_tokens(customer_id);

-- License (nguon su that duy nhat cho MOI app: video-builder, facebook...).
-- Schema nay la CHUAN DUNG CHUNG giua web (Pages) va worker app (hora-worker-vb
-- doc cheo qua binding DB_VB). Cot `id` la ten chuan (worker dung `id`).
CREATE TABLE IF NOT EXISTS licenses (
  id             TEXT PRIMARY KEY,      -- license_id (32 hex)
  license_key    TEXT NOT NULL UNIQUE,  -- <PREFIX>_<32 hex>
  customer_id    TEXT REFERENCES customers(id),  -- NULL = license cap tay / chua gan khach
  app            TEXT NOT NULL,         -- 'video-builder' | ...
  product_id     TEXT NOT NULL,         -- 'video-builder' | ...
  tier           TEXT NOT NULL,         -- 'go' | 'plus' | 'pro'
  status         TEXT NOT NULL DEFAULT 'active',
  organization   TEXT,                  -- 'admin' (cap tay) | 'user' (mua web) | slug
  expiry_utc     TEXT,                  -- NULL = chua kich hoat (dem han tu luc bind)
  validity_days  INTEGER NOT NULL DEFAULT 0,
  activated_at   TEXT,
  revoked_at     TEXT,
  source         TEXT NOT NULL CHECK (source IN ('purchase','claim','manual')),
  order_id       TEXT REFERENCES orders(id),
  -- Cot phuc vu he license cu (worker doc/ghi khi cap/doi chieu):
  issued_by      TEXT,                  -- admin/user nao cap (NULL khi mua web)
  customer_email TEXT,
  customer_name  TEXT,
  notes          TEXT,
  device_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_licenses_cust ON licenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_licenses_app ON licenses(app);

-- Device binding: 1 license = 1 may (fingerprint do client gui).
-- PK (app, device_id) — dung chung cho moi app. Worker app dung bang nay qua
-- AppDeviceStore (app_device_bindings) va LicenseStore (device_components).
CREATE TABLE IF NOT EXISTS devices (
  app               TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  license_id        TEXT NOT NULL REFERENCES licenses(id),
  customer_id       TEXT REFERENCES customers(id),
  bound_at          TEXT NOT NULL,
  device_components TEXT,               -- JSON mang thanh phan fingerprint (unbind flow)
  device_id_hash    TEXT,
  last_change_at    TEXT,
  PRIMARY KEY (app, device_id)
);
CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id);

-- Worker app (hora-worker-vb) doc/ghi cac bang duoi day qua binding DB_VB.
-- Giu dung TEN COT nhu schema app cu cua hora-vb de khong phai sua store.

-- Device binding theo app: device nao dang gan license nao.
CREATE TABLE IF NOT EXISTS app_device_bindings (
  app        TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  license_id TEXT NOT NULL,
  bound_at   TEXT NOT NULL,
  PRIMARY KEY (app, device_id)
);
CREATE INDEX IF NOT EXISTS idx_app_bind_license ON app_device_bindings(app, license_id);

-- Lan doi may gan nhat (cooldown).
CREATE TABLE IF NOT EXISTS app_device_lastchange (
  app        TEXT NOT NULL,
  license_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (app, license_id)
);

-- Lich su device da thay (batch cu) — chi ghi/ doc boi license flow cu.
CREATE TABLE IF NOT EXISTS license_devices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id  TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  first_seen  TEXT NOT NULL,
  UNIQUE(license_id, device_hash)
);
CREATE INDEX IF NOT EXISTS idx_license_devices_license ON license_devices(license_id);

-- Plans/quota theo app (worker doc de tra plan; co fallback default trong code).
CREATE TABLE IF NOT EXISTS plans (
  app        TEXT NOT NULL,
  tier       TEXT NOT NULL,
  name       TEXT NOT NULL,
  quota_json TEXT NOT NULL,
  PRIMARY KEY (app, tier)
);

-- Yeu cau go thiet bi (unbind) — tu dong hoac admin duyet.
CREATE TABLE IF NOT EXISTS unbind_requests (
  request_id       TEXT PRIMARY KEY,
  license_id       TEXT,
  status           TEXT NOT NULL,
  old_device       TEXT,
  new_device       TEXT,
  customer_email   TEXT,
  customer_name    TEXT,
  bill_reference   TEXT,
  reason           TEXT,
  auto_check_notes TEXT,
  license_key_hash TEXT,
  client_ip_hash   TEXT,
  created_at       TEXT NOT NULL,
  decided_at       TEXT,
  decided_by       TEXT
);

-- Feedback cua khach tren app desktop.
CREATE TABLE IF NOT EXISTS app_feedback (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL UNIQUE,
  app              TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  device_id        TEXT NOT NULL,
  device_hash      TEXT,
  license_id       TEXT,
  plan             TEXT,
  kind             TEXT NOT NULL,
  content          TEXT NOT NULL,
  app_version      TEXT,
  os               TEXT,
  log_text         TEXT,
  attachments_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_app_feedback_created ON app_feedback(app, created_at);
CREATE INDEX IF NOT EXISTS idx_app_feedback_license ON app_feedback(app, license_id);

-- Blocklist version (LicenseStore doc/ghi khi revoke/restore license).
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Nhat ky doi may (cooldown 7 ngay) — dung boi API web /api/app/device-change.
CREATE TABLE IF NOT EXISTS device_changes (
  id          TEXT PRIMARY KEY,
  license_id  TEXT NOT NULL REFERENCES licenses(id),
  old_device  TEXT,
  new_device  TEXT NOT NULL,
  changed_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_changes_license ON device_changes(license_id);
