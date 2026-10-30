-- Video mau trang chu load tu database (2026-10-30).
-- Chay 1 lan tren D1 hora-website (production):
--   npx wrangler d1 execute hora-website --remote --file db/migrate-demo-videos-2026-10-30.sql
-- AN TOAN chay lai nhieu lan: CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE
-- (dong seed da co thi giu nguyen, khong ghi de video_url da cap nhat).
--
-- Sau khi chay: trang chu tu load danh sach qua GET /api/demos.
-- Cap nhat video THAT: dien video_url cho tung dong (D1 console, hoac
-- POST /api/internal/demos kem header X-Identity-Secret) — khong can deploy.
-- video_url nhan: link MP4/WebM truc tiep, link YouTube, link Vimeo.

CREATE TABLE IF NOT EXISTS demo_videos (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT,
  description TEXT,
  video_url   TEXT NOT NULL DEFAULT '',
  poster_url  TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_videos_order ON demo_videos(enabled, sort_order);

-- Seed 4 mau dang hien tren trang chu (video_url de trong — dien link video
-- that sau; truoc khi dien, the hien anh poster va bao "dang cap nhat").
INSERT OR IGNORE INTO demo_videos (id, title, category, description, video_url, poster_url, sort_order, enabled, created_at, updated_at) VALUES
  ('my-pham-cao-cap',    'Mỹ phẩm cao cấp',    'Beauty / Skincare',  'Phong cách quảng cáo tinh tế',       '', 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85', 1, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('do-gia-dung',        'Đồ gia dụng',        'Home & Living',      'Sản phẩm trong không gian sống',     '', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=85',     2, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('thoi-trang-toi-gian','Thời trang tối giản','Fashion',            'Nhấn vào chất liệu và kiểu dáng',    '', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85', 3, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('nuoc-hoa-lam-dep',   'Nước hoa & làm đẹp', 'Beauty / Lifestyle', 'Mood hình ảnh sang trọng',           '', 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=85', 4, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z');
