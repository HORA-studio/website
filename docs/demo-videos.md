# Video mẫu (Demo) — load từ database, phát video thật

## Mô hình

Danh sách video ở mục **"Thư viện ý tưởng"** trên trang chủ **không còn hard-code** trong `index.html` nữa. Dữ liệu thật nằm trong D1 `hora-website`, bảng **`demo_videos`**:

| Cột | Ý nghĩa |
|---|---|
| `id` | slug duy nhất, vd `my-pham-cao-cap` |
| `title` | Tiêu đề mẫu (bắt buộc) |
| `category` | Nhóm phân loại hiện trên thẻ, vd `Beauty / Skincare` |
| `description` | Mô tả ngắn dưới tiêu đề |
| `video_url` | Link video: **MP4/WebM trực tiếp**, hoặc link **YouTube** / **Vimeo**. Để trống = chưa có video (thẻ vẫn hiện ảnh, cửa sổ xem báo "đang cập nhật") |
| `poster_url` | Ảnh thumbnail của thẻ + poster khi phát video |
| `meta` | Chuỗi **JSON** tuỳ ý cho thông tin phụ của từng video. Hiện dùng `{"size":"16:9"}` / `"9:16"` / `"1:1"` để chọn khung hiển thị thẻ |
| `sort_order` | Thứ tự hiện (nhỏ trước) |
| `enabled` | `1` = hiện trên trang chủ, `0` = ẩn |

Field `meta` cho phép thêm thuộc tính mới **không cần đổi schema**: chỉ cần sửa JSON. API `/api/demos` bơm `meta.size` ra ngoài thành field `size` cho frontend; các field khác trong `meta` vẫn nằm trong object `meta`. Nếu **mọi** video cùng một `size`, lưới trang chủ tự chọn khung đó (danh sách lẫn size thì giữ mặc định 16:9).

Luồng dữ liệu:

- Trang chủ vẽ ngay danh sách dự phòng (`CONFIG.demos` trong `index.html`), rồi gọi **`GET /api/demos`** và vẽ lại bằng dữ liệu DB. API lỗi/không sẵn sàng → giữ bản dự phòng, trang không bao giờ trống phần demo.
- `GET /api/demos` chỉ trả video `enabled = 1`, sắp theo `sort_order`, cache tối đa 60 giây. Bảng chưa migrate / đang rỗng → trả danh sách mặc định trong `functions/api/_demos.js` (fail-soft).
- Bấm vào thẻ → mở cửa sổ xem: link file (MP4/WebM) phát bằng thẻ `<video>` (tự phát, có điều khiển, poster = `poster_url`); link YouTube/Vimeo tự chuyển sang iframe nhúng. Đóng cửa sổ là dừng phát hẳn (kể cả iframe).

## Đổi video (KHÔNG cần deploy code)

Cách 1 — endpoint nội bộ (giống khuyến mãi, dùng `IDENTITY_INTERNAL_SECRET`):

```bash
# Xem danh sách hiện tại (kèm video đang tắt)
curl https://hora.works/api/internal/demos -H "X-Identity-Secret: <SECRET>"

# Ghi đè toàn bộ danh sách
curl -X POST https://hora.works/api/internal/demos \
  -H "X-Identity-Secret: <SECRET>" -H "Content-Type: application/json" \
  -d '{"demos":[
    {"id":"my-pham-cao-cap","title":"Mỹ phẩm cao cấp","type":"Beauty / Skincare",
     "desc":"Phong cách quảng cáo tinh tế",
     "videoUrl":"https://releases.hora.works/demos/my-pham.mp4",
     "image":"https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85",
     "sortOrder":1,"enabled":true}
  ]}'

# Xóa 1 video
curl -X DELETE "https://hora.works/api/internal/demos?id=my-pham-cao-cap" \
  -H "X-Identity-Secret: <SECRET>"
```

Cách 2 — sửa trực tiếp bảng `demo_videos` trong D1 Console (Cloudflare): chỉ cần điền `video_url` cho dòng có sẵn là trang chủ phát được ngay.

## Cần làm khi lên production lần đầu

1. Chạy migration `db/migrate-demo-videos-2026-10-30.sql` trên D1 `hora-website` (tạo bảng + seed sẵn 8 mẫu kèm link video).
2. Nếu bảng đã tồn tại từ trước (chưa có cột `meta`): chạy `db/migrate-demo-videos-meta-2026-10-30.sql` (thêm cột `meta`, chạy 1 lần) rồi `db/migrate-demo-videos-meta-seed-2026-10-30.sql` (gán `size` cho 11 video, chạy lại an toàn).
3. Deploy code như bình thường.

Danh sách seed hiện tại: **8 mẫu kèm sẵn link video stock Pexels đã kiểm chứng** — 4 ngang 16:9 cho 4 mẫu gốc (Mỹ phẩm 9697928, Đồ gia dụng 7578540, Thời trang 8328501, Nước hoa 6802240) và 4 dọc 9:16 (Mỹ phẩm 6951174, Café tại nhà 3753718, Thời trang 16093155, Nước hoa 5758891); poster cũng là khung hình thật từ Pexels. Nếu đã chạy bản migration seed cũ (4 mẫu, `video_url` trống) thì chạy thêm `db/update-demo-videos-links-2026-10-30.sql` — file này upsert cả 8 mẫu, chạy lại nhiều lần an toàn. Muốn thay bằng video của mình sau này: sửa `video_url` theo mục "Đổi video" ở trên (link MP4/WebM tự host, YouTube hoặc Vimeo đều được).
