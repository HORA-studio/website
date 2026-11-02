-- Them cot `meta` (JSON) cho bang demo_videos + gan size cho danh sach hien tai
-- (2026-10-30). Chay tren D1 hora-website:
--   npx wrangler d1 execute hora-website --remote --file db/migrate-demo-videos-meta-2026-10-30.sql
--
-- Cot meta de chua thong tin phu cua tung video; hien dung cho { "size": "16:9"
-- | "9:16" | "1:1" } de the tren trang chu chon khung hien thi. Them field moi
-- sau nay (vd "duration", "tag") chi can sua JSON, khong phai doi schema.
--
-- CHI chay 1 lan cho DB DA co bang demo_videos ma CHUA co cot meta. Neu bang
-- moi tao bang db/migrate-demo-videos-2026-10-30.sql thi cot meta da co san,
-- KHONG can file nay (chay se bao "duplicate column name: meta").
--
-- File tach lam 2 phan de chay doc lap:
--   1) migrate-demo-videos-meta-2026-10-30.sql          -> ALTER TABLE (chay 1 lan)
--   2) migrate-demo-videos-meta-seed-2026-10-30.sql     -> UPDATE size (chay lai an toan)

ALTER TABLE demo_videos ADD COLUMN meta TEXT;
