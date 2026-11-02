-- Migration 2026-11-02: phien dang nhap DOC QUYEN theo tai khoan.
-- 1 tai khoan + 1 app = 1 may tai mot thoi diem. May vao TRUOC giu phien; may
-- vao SAU bi chan ngay o device/poll (khong cap token); may cu nha phien bang
-- nut Dang xuat -> may sau vao duoc.
--
-- Ap dung:
--   npx wrangler d1 execute hora-website --remote --file db/migrate-account-sessions-2026-11-02.sql
-- (chay --local truoc khi test o may.)
--
-- LUU Y: file idempotent (CREATE ... IF NOT EXISTS) nen chay lai an toan.
-- DB moi cai bang db/schema.sql cung da co bang nay (giu 2 file khop nhau).
--
-- Thay the ban thiet ke cu: ban cu luu phien tren cot `licenses.session_device_id`
-- (file migrate-session-device-2026-11-02.sql). Neu file do DA chay remote thi cac
-- cot `session_*` tren `licenses` con nam do nhung KHONG con duoc ghi/doc nua —
-- vo hai, co the bo qua hoac DROP sau.

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
