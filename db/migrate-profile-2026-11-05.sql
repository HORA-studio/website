-- Migration: thong tin ca nhan mo rong (2026-11-05) — trang tai khoan
-- dang settings: so dien thoai + anh dai dien.
--   phone      — khach tu cap nhat trong muc Thong tin.
--   avatar_url — anh Google (https://...) khi dang nhap/lien ket Google,
--                hoac data URL anh khach tai len (client nen 160x160).
-- Ap len D1 production (hora-website):
--   npx wrangler d1 execute hora-website --remote --file db/migrate-profile-2026-11-05.sql
-- LUU Y: ALTER TABLE ... ADD COLUMN chi chay duoc 1 lan cho moi cot —
-- chay lai se bao loi "duplicate column name" (bo qua neu da ap).
-- Code fail-soft: chua ap thi trang tai khoan chi khong luu duoc 2 truong
-- nay, cac chuc nang khac khong anh huong.
ALTER TABLE customers ADD COLUMN phone TEXT;
ALTER TABLE customers ADD COLUMN avatar_url TEXT;
