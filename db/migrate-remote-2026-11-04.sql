-- Migration 2026-11-04: bang remote_registrations cho Web Remote
-- (muc Remote trong trang tai khoan: quet QR / nhap ma 6 so -> tra Tunnel).
--
-- App desktop khi mo se dang ky (tunnel_url + hash cua ma ghep) len website
-- qua POST /api/app/remote-register; web dang nhap tra ma qua
-- POST /api/remote/lookup de lay tunnel_url cua CHINH tai khoan minh.
-- Ma chi song 10 phut (expires_at); chi luu SHA-256 cua ma, khong luu ma tho.
-- Idempotent: chay lai an toan.
--
-- Ap dung production (user lam o local):
--   npx wrangler d1 execute hora-website --remote --file db/migrate-remote-2026-11-04.sql

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
