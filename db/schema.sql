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
  google_sub    TEXT,                   -- dinh danh Google (sub) khi dang nhap Google; NULL = chua lien ket
  google_email  TEXT,                   -- email cua Google da lien ket (co the khac email tai khoan khi lien ket thu cong)
  phone         TEXT,                   -- so dien thoai khach tu cap nhat o trang tai khoan
  avatar_url    TEXT,                   -- anh dai dien: URL Google hoac data URL anh tai len (160x160)
  created_at    TEXT NOT NULL           -- ISO 8601 UTC
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_google_sub ON customers(google_sub) WHERE google_sub IS NOT NULL;

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
  license_id  TEXT,
  bonus_days  INTEGER NOT NULL DEFAULT 0  -- ngay khuyen mai cong them khi cap license (xem _promo.js)
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

-- Phien dang nhap DOC QUYEN theo tai khoan: 1 tai khoan + 1 app = 1 may tai mot
-- thoi diem. May vao TRUOC giu phien; may vao SAU bi chan ngay o device/poll
-- (khong cap token). May cu nha phien bang nut Dang xuat -> may sau vao duoc.
-- Khong co TTL: nha la tuong minh (xem /api/app/session-release).
CREATE TABLE IF NOT EXISTS account_sessions (
  customer_id        TEXT NOT NULL REFERENCES customers(id),
  app                TEXT NOT NULL,       -- 'video-builder' | 'facebook-builder' | ...
  session_device_id  TEXT,                -- may dang giu phien (NULL = chua ai / da nha)
  session_started_at TEXT,                -- ISO 8601 UTC luc giu phien
  session_ip_hash    TEXT,                -- hash IP luc giu phien (chan doan)
  released_at        TEXT,                -- lan nha gan nhat (audit/debug)
  last_blocked_at    TEXT,                -- lan bi chan gan nhat (cooldown 60s)
  PRIMARY KEY (customer_id, app)
);

-- Phien "device authorization" (kieu GitHub): app desktop xin cap device_code +
-- user_code, user mo browser bam "Dong y", app poll nhan token (khong copy-paste ma).
-- device_code chi luu SHA-256; user_code la ma ngan doi chieu tren web.
CREATE TABLE IF NOT EXISTS device_auth (
  device_code_hash TEXT PRIMARY KEY,    -- sha256(device_code)
  user_code        TEXT NOT NULL UNIQUE,
  app              TEXT NOT NULL,       -- 'video-builder' | 'facebook-builder' | ...
  device_id        TEXT,
  ip               TEXT,                -- IP luc start (chi de rate limit)
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied | expired
  customer_id      TEXT REFERENCES customers(id),   -- set khi user dong y tren web
  created_at       TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL DEFAULT 5,
  last_polled_at   TEXT,
  approved_at      TEXT,
  token_issued_at  TEXT                 -- set khi app da lay token (chi phat 1 lan)
);
CREATE INDEX IF NOT EXISTS idx_device_auth_user_code ON device_auth(user_code);
CREATE INDEX IF NOT EXISTS idx_device_auth_expires ON device_auth(expires_at);

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
CREATE INDEX IF NOT EXISTS idx_licenses_order ON licenses(order_id);
CREATE INDEX IF NOT EXISTS idx_licenses_cust ON licenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_licenses_app ON licenses(app);

-- Device binding: 1 license = 1 may (fingerprint do client gui).
-- PK (app, device_id). Day la BANG DUY NHAT cho bind device (da gop
-- app_device_bindings + app_device_lastchange vao day 2026-10-29).
-- Worker app doc qua AppDeviceStore; LicenseStore doc device_components.
CREATE TABLE IF NOT EXISTS devices (
  app               TEXT NOT NULL,
  device_id         TEXT NOT NULL,      -- fingerprint THO do client gui
  license_id        TEXT NOT NULL REFERENCES licenses(id),
  customer_id       TEXT REFERENCES customers(id),
  bound_at          TEXT NOT NULL,
  device_components TEXT,               -- JSON mang thanh phan fingerprint (unbind/validate)
  device_id_hash    TEXT,
  last_change_at    TEXT,
  PRIMARY KEY (app, device_id)
);
CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id);

-- Plans/quota theo app (worker doc de tra plan; co fallback default trong code).
CREATE TABLE IF NOT EXISTS plans (
  app        TEXT NOT NULL,
  tier       TEXT NOT NULL,
  name       TEXT NOT NULL,
  quota_json TEXT NOT NULL,
  PRIMARY KEY (app, tier)
);

-- Blocklist version (LicenseStore doc/ghi khi revoke/restore license).
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Video mau trang chu (muc "Thu vien y tuong" / Demo): trang chu doc qua
-- GET /api/demos, quan tri qua /api/internal/demos — doi video KHONG can
-- sua code/deploy lai. video_url: MP4/WebM truc tiep hoac link YouTube/Vimeo;
-- rong = chua co video (the hien anh poster + bao dang cap nhat).
CREATE TABLE IF NOT EXISTS demo_videos (
  id          TEXT PRIMARY KEY,         -- slug duy nhat, vd 'my-pham-cao-cap'
  title       TEXT NOT NULL,
  category    TEXT,                     -- nhom phan loai, vd 'Beauty / Skincare'
  description TEXT,
  video_url   TEXT NOT NULL DEFAULT '',
  poster_url  TEXT,                     -- anh thumbnail/poster cua the
  meta        TEXT,                     -- JSON tuy y, vd {"size":"16:9"} (khung hien thi the)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,  -- 0 = an khoi trang chu
  created_at  TEXT NOT NULL,            -- ISO 8601 UTC
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_videos_order ON demo_videos(enabled, sort_order);

-- Dang ky Web Remote: app desktop khi mo dang ky (tunnel_url + hash ma ghep
-- 6 so) de muc Remote trong trang tai khoan tra ma -> lay dung Tunnel cua
-- chinh tai khoan (kieu Chrome Remote Desktop). Xem
-- db/migrate-remote-2026-11-04.sql + docs/web-remote.md muc 0.
CREATE TABLE IF NOT EXISTS remote_registrations (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id), -- 1 tai khoan = 1 dang ky dang song (khop luat 1 slot)
  app         TEXT NOT NULL DEFAULT 'video-builder',     -- 'video-builder' | 'facebook-builder' | ...
  device_id   TEXT,                                      -- deviceId cua app (chan doan)
  device_name TEXT,                                      -- ten may hien cho user, vd DESKTOP-01
  tunnel_url  TEXT NOT NULL,                             -- URL Tunnel hien tai cua app (doi moi lan mo app)
  code_hash   TEXT NOT NULL,                             -- SHA-256(customer_id || ':' || ma 6 so); ma tho khong luu
  created_at  TEXT NOT NULL,                             -- ISO 8601 UTC
  expires_at  TEXT NOT NULL                              -- ISO 8601 UTC, mac dinh +10 phut
);
CREATE INDEX IF NOT EXISTS idx_remote_reg_code ON remote_registrations(code_hash);
CREATE INDEX IF NOT EXISTS idx_remote_reg_expires ON remote_registrations(expires_at);

-- Nhat ky doi may (cooldown 7 ngay) — dung boi API web /api/app/device-change.
CREATE TABLE IF NOT EXISTS device_changes (
  id          TEXT PRIMARY KEY,
  license_id  TEXT NOT NULL REFERENCES licenses(id),
  old_device  TEXT,
  new_device  TEXT NOT NULL,
  changed_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_changes_license ON device_changes(license_id);

-- (Da xoa 2026-10-29: app_device_bindings, app_device_lastchange, license_devices —
--  gop vao `devices`; app_feedback — desktop dung Google Sheet; unbind_requests —
--  thay bang /api/app/device-change.)

-- So cai credit cua Studio: so du = SUM(amount) theo customer.
-- reason: 'purchase' (mua goi) | 'spend' (tao) | 'refund' (gen loi hoan) |
--         'grant' (tang/admin) | 'redeem' (doi ma)
CREATE TABLE IF NOT EXISTS studio_credit_ledger (
  id            TEXT PRIMARY KEY,       -- led_<time36><random>
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  amount        INTEGER NOT NULL,       -- duong = cong, am = tru
  reason        TEXT NOT NULL,
  ref_id        TEXT,                   -- order id / generation id / ma redeem
  label         TEXT,                   -- mo ta hien cho khach
  balance_after INTEGER NOT NULL,       -- so du ngay sau dong nay (de doi soat)
  created_at    TEXT NOT NULL           -- ISO 8601 UTC
);
CREATE INDEX IF NOT EXISTS idx_studio_ledger_customer ON studio_credit_ledger(customer_id, created_at);

-- Mot lan gen (anh hoac video). File that o R2 (result_key), DB giu metadata.
-- status: queued -> processing -> done | failed | expired
CREATE TABLE IF NOT EXISTS studio_generations (
  id           TEXT PRIMARY KEY,        -- gen_<time36><random>
  customer_id  TEXT NOT NULL REFERENCES customers(id),
  kind         TEXT NOT NULL,           -- 'image' | 'video'
  prompt       TEXT NOT NULL,
  model        TEXT NOT NULL,           -- id model, vd 'kling-2-6'
  model_name   TEXT NOT NULL,           -- ten hien thi tai thoi diem tao
  params_json  TEXT,                    -- {ratio, duration, sourceKey}
  status       TEXT NOT NULL DEFAULT 'queued',
  credit_cost  INTEGER NOT NULL,
  provider_job TEXT,                    -- job id cua provider (fal/Dreamina) khi worker da gui
  result_key   TEXT,                    -- khoa file ket qua trong R2 STUDIO_MEDIA
  result_url   TEXT,                    -- URL doc ket qua (signed/proxy) khi done
  error        TEXT,
  created_at   TEXT NOT NULL,           -- ISO 8601 UTC
  completed_at TEXT,
  expires_at   TEXT NOT NULL            -- created_at + 30 ngay; cron don file + danh dau expired
);
CREATE INDEX IF NOT EXISTS idx_studio_gen_customer ON studio_generations(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_studio_gen_status ON studio_generations(status, created_at);
CREATE INDEX IF NOT EXISTS idx_studio_gen_expires ON studio_generations(expires_at);

-- Ma token nap tien Studio (redeem) — token do server thanh toan cua chu shop
-- ghi vao; khach doi token lay credit qua POST /api/studio/redeem (dung 1 lan).
CREATE TABLE IF NOT EXISTS studio_redeem_tokens (
  token TEXT PRIMARY KEY,
  credits INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  used_by TEXT,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_studio_tokens_usedby ON studio_redeem_tokens(used_by);
