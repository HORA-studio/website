-- Gan `size` vao cot meta cho 11 video hien co (2026-10-30). Chay tren D1
-- hora-website SAU khi da co cot meta (db/migrate-demo-videos-meta-2026-10-30.sql):
--   npx wrangler d1 execute hora-website --remote --file db/migrate-demo-videos-meta-seed-2026-10-30.sql
--
-- AN TOAN chay lai nhieu lan: chi dien cho dong chua co meta (meta IS NULL /
-- rong), KHONG ghi de meta da sua tay.

-- 4 video ngang 16:9
UPDATE demo_videos SET meta = '{"size":"16:9"}'
  WHERE id IN ('thoi-trang-toi-gian', 'am-dun-nuoc', 'serum-duong-da', 'nuoc-hoa-cao-cap')
  AND (meta IS NULL OR meta = '');

-- 7 video doc 9:16
UPDATE demo_videos SET meta = '{"size":"9:16"}'
  WHERE id IN ('vest-trang-doc', 'ao-dai-tet-doc', 'pho-neon-doc', 'bong-ro-doc',
               'cafe-pour-over-doc', 'serum-duong-da-doc', 'nuoc-hoa-doc')
  AND (meta IS NULL OR meta = '');
