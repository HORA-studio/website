-- Migration 2026-10-29: xac thuc email + quen mat khau (auth_tokens).
-- Danh cho DB remote DA TON TAI (DB moi cai bang db/schema.sql thi khong can file nay).
--
-- Ap dung:
--   npx wrangler d1 execute hora-website --remote --file db/migrate-auth-2026-10-29.sql
-- (DB hien tai ten la "hora-website" — xem wrangler.toml. Chay --local truoc
-- neu muon thu tren may.)
--
-- LUU Y QUAN TRONG: lenh ALTER TABLE ... ADD COLUMN chi chay duoc 1 LAN.
-- Chay lai file nay se bao loi "duplicate column name: email_verified_at" —
-- do la binh thuong khi migration da duoc ap roi; cac lenh CREATE TABLE /
-- CREATE INDEX o duoi dung IF NOT EXISTS nen an toan khi chay lai.

ALTER TABLE customers ADD COLUMN email_verified_at TEXT;

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
