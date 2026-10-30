-- Gan 8 link video Pexels cho bang demo_videos (2026-10-30) — chay tren D1
-- hora-website SAU khi da co bang (db/migrate-demo-videos-2026-10-30.sql):
--   npx wrangler d1 execute hora-website --remote --file db/update-demo-videos-links-2026-10-30.sql
-- AN TOAN chay lai nhieu lan: INSERT ... ON CONFLICT(id) DO UPDATE — dong
-- chua co thi them moi, dong da co thi cap nhat link/anh/thu tu theo ban nay.
-- Danh sach: 4 video ngang 16:9 (4 mau goc) + 4 video doc 9:16 (mau moi).
INSERT INTO demo_videos (id, title, category, description, video_url, poster_url, sort_order, enabled, created_at, updated_at)
VALUES
  ('my-pham-cao-cap', 'Mỹ phẩm cao cấp', 'Beauty / Skincare', 'Phong cách quảng cáo tinh tế', 'https://videos.pexels.com/video-files/9697928/9697928-hd_1920_1080_25fps.mp4', 'https://images.pexels.com/videos/9697928/pexels-photo-9697928.jpeg?auto=compress&w=900', 1, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('do-gia-dung', 'Đồ gia dụng', 'Home & Living', 'Sản phẩm trong không gian sống', 'https://videos.pexels.com/video-files/7578540/7578540-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/7578540/apartment-at-home-business-buy-7578540.jpeg?auto=compress&w=900', 2, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('thoi-trang-toi-gian', 'Thời trang tối giản', 'Fashion', 'Nhấn vào chất liệu và kiểu dáng', 'https://videos.pexels.com/video-files/8328501/8328501-hd_1920_1080_25fps.mp4', 'https://images.pexels.com/videos/8328501/pexels-photo-8328501.jpeg?auto=compress&w=900', 3, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('nuoc-hoa-lam-dep', 'Nước hoa & làm đẹp', 'Beauty / Lifestyle', 'Mood hình ảnh sang trọng', 'https://videos.pexels.com/video-files/6802240/6802240-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/6802240/4k-4k-video-aromatherapy-background-6802240.jpeg?auto=compress&w=900', 4, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('my-pham-doc', 'Mỹ phẩm — dọc 9:16', 'Beauty / Skincare', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://videos.pexels.com/video-files/6951174/6951174-hd_1080_1920_24fps.mp4', 'https://images.pexels.com/videos/6951174/pexels-photo-6951174.jpeg?auto=compress&w=900', 5, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('do-gia-dung-doc', 'Café tại nhà — dọc 9:16', 'Home & Living', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://videos.pexels.com/video-files/3753718/3753718-hd_1080_1920_25fps.mp4', 'https://images.pexels.com/videos/3753718/pexels-photo-3753718.jpeg?auto=compress&w=900', 6, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('thoi-trang-doc', 'Thời trang — dọc 9:16', 'Fashion', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://videos.pexels.com/video-files/16093155/16093155-hd_1080_1920_30fps.mp4', 'https://images.pexels.com/videos/16093155/beautiful-beauty-clothing-dress-16093155.jpeg?auto=compress&w=900', 7, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('nuoc-hoa-doc', 'Nước hoa — dọc 9:16', 'Beauty / Lifestyle', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://videos.pexels.com/video-files/5758891/5758891-hd_1080_1920_30fps.mp4', 'https://images.pexels.com/videos/5758891/pexels-photo-5758891.jpeg?auto=compress&w=900', 8, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  category = excluded.category,
  description = excluded.description,
  video_url = excluded.video_url,
  poster_url = excluded.poster_url,
  sort_order = excluded.sort_order,
  enabled = excluded.enabled,
  updated_at = excluded.updated_at;
