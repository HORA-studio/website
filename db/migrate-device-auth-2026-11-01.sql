-- Migration 2026-11-01: device authorization flow (kieu GitHub) — app desktop
-- xin cap device_code/user_code, user mo browser bam "Dong y", app poll nhan token.
-- Thay the buoc copy-paste ma ket noi thu cong.
--
-- Ap dung:
--   npx wrangler d1 execute hora-website --remote --file db/migrate-device-auth-2026-11-01.sql
-- (chay --local truoc neu muon thu tren may.)
--
-- LUU Y: file nay idempotent (CREATE ... IF NOT EXISTS) nen chay lai an toan.
-- DB moi cai bang db/schema.sql cung da co bang nay (giu 2 file khop nhau).

CREATE TABLE IF NOT EXISTS device_auth (
  device_code_hash TEXT PRIMARY KEY,    -- sha256(device_code); device_code app giu, khong luu tho
  user_code        TEXT NOT NULL UNIQUE, -- ma ngan de doi chieu tren web (vd ABCD-1234)
  app              TEXT NOT NULL,       -- 'video-builder' | 'facebook-builder' | ...
  device_id        TEXT,                -- deviceId app gui kem khi start
  ip               TEXT,                -- IP luc start (chi de rate limit)
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied | expired
  customer_id      TEXT REFERENCES customers(id),   -- set khi user dong y tren web
  created_at       TEXT NOT NULL,       -- ISO 8601 UTC
  expires_at       TEXT NOT NULL,       -- ISO 8601 UTC
  interval_seconds INTEGER NOT NULL DEFAULT 5,      -- khoang poll app nen dung (giay)
  last_polled_at   TEXT,                -- lan poll gan nhat (tinh slow_down)
  approved_at      TEXT,
  token_issued_at  TEXT                 -- set khi app da lay token (chi phat 1 lan)
);
CREATE INDEX IF NOT EXISTS idx_device_auth_user_code ON device_auth(user_code);
CREATE INDEX IF NOT EXISTS idx_device_auth_expires ON device_auth(expires_at);
