-- Migration: them cot google_sub cho dang nhap Google (2026-11-05).
-- Ap len D1 production (hora-website):
--   npx wrangler d1 execute hora-website --remote --file db/migrate-google-2026-11-05.sql
-- LUU Y: ALTER TABLE ... ADD COLUMN chi chay duoc 1 lan — chay lai se bao
-- loi "duplicate column name: google_sub" (bo qua loi do neu da ap).
-- Code da fail-soft: chua ap migration thi dang nhap Google van chay
-- (lien ket theo email da xac thuc), ap xong se gan them google_sub.
ALTER TABLE customers ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_google_sub ON customers(google_sub) WHERE google_sub IS NOT NULL;
