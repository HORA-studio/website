-- Cap nhat danh sach video mau trang chu: thay 8 video stock Pexels bang
-- 11 video THAT cua HORA tren R2 (bucket hora-archive-release, thu muc
-- hora.website/video_demo/, phuc vu qua releases.hora.works) — 2026-10-30.
-- Chay tren D1 hora-website (SAU khi da co bang demo_videos):
--   npx wrangler d1 execute hora-website --remote --file db/update-demo-videos-r2-2026-10-30.sql
-- AN TOAN chay lai nhieu lan: xoa toan bo danh sach cu roi ghi ban nay
-- (11 video: 4 ngang 16:9 + 7 doc 9:16, moi video 10 giay; tieu de/nhom
-- dat theo noi dung tung video). poster_url de trong — the dung nen
-- gradient + tieu de nhu thiet ke goc.
-- LUU Y: cau nay ghi 11 dong KHONG kem cot meta (de tranh phu thuoc cot meta co
-- ton tai hay khong). Sau khi chay, neu bang da co cot meta thi chay them
-- db/migrate-demo-videos-meta-2026-10-30.sql de gan size cho tung video.
DELETE FROM demo_videos;
INSERT INTO demo_videos (id, title, category, description, video_url, poster_url, sort_order, enabled, created_at, updated_at) VALUES
  ('thoi-trang-toi-gian', 'Thời trang tối giản', 'Fashion', 'Nhấn vào chất liệu và kiểu dáng', 'https://releases.hora.works/hora.website/video_demo/900f7adea434407282522a460479cade.mp4', '', 1, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('am-dun-nuoc', 'Ấm đun nước nhà bếp', 'Home & Living', 'Sản phẩm trong không gian sống', 'https://releases.hora.works/hora.website/video_demo/b9d5f06a450b4893984912bf433f6f24.mp4', '', 2, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('serum-duong-da', 'Serum dưỡng da', 'Beauty / Skincare', 'Phong cách quảng cáo tinh tế', 'https://releases.hora.works/hora.website/video_demo/d0d032397ce940889d20ed1ab7b78781.mp4', '', 3, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('nuoc-hoa-cao-cap', 'Nước hoa cao cấp', 'Beauty / Lifestyle', 'Mood hình ảnh sang trọng', 'https://releases.hora.works/hora.website/video_demo/e70bfada097f4a41be3237304a2c17be.mp4', '', 4, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('vest-trang-doc', 'Vest trắng thanh lịch — dọc 9:16', 'Fashion', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://releases.hora.works/hora.website/video_demo/08feef6fcfee4255827e16a35be09aa3.mp4', '', 5, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ao-dai-tet-doc', 'Áo dài Tết — dọc 9:16', 'Fashion', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://releases.hora.works/hora.website/video_demo/49d187f0c1f446efa1d333d1f19051f9.mp4', '', 6, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('pho-neon-doc', 'Phố neon điện ảnh — dọc 9:16', 'Cinematic', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://releases.hora.works/hora.website/video_demo/682d168926074336b66a5b3999ef9755.mp4', '', 7, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('bong-ro-doc', 'Bóng rổ — dọc 9:16', 'Sports', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://releases.hora.works/hora.website/video_demo/a0cb2f7e5e214f3c9f6426b1615aabd7.mp4', '', 8, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('cafe-pour-over-doc', 'Café pour-over — dọc 9:16', 'Food & Drink', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://releases.hora.works/hora.website/video_demo/e24a15e55d694faba956a4647c56f27c.mp4', '', 9, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('serum-duong-da-doc', 'Serum dưỡng da — dọc 9:16', 'Beauty / Skincare', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://releases.hora.works/hora.website/video_demo/f11306e3d6824d68bda8c72cc0917c2f.mp4', '', 10, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('nuoc-hoa-doc', 'Nước hoa — dọc 9:16', 'Beauty / Lifestyle', 'Định dạng dọc cho TikTok / Reels / Shorts', 'https://releases.hora.works/hora.website/video_demo/fd47c785eb0e405eae5976864bb74164.mp4', '', 11, 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z');
