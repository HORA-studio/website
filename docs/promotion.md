# Khuyến mãi — danh sách đợt, "type", banner chạy & cách đổi cấu hình

## Mô hình: NHIỀU đợt chạy song song, mỗi đợt một `type`
Cấu hình là **một mảng JSON** trong bảng `meta` của D1 `hora-website`, key = `promotions`.
Mỗi phần tử là một đợt: `{ id, enabled, type, name, headline, link, startsAt, endsAt, trialTier, trialDays, purchaseBonusPercent }`.

`type` quyết định đợt đó cho quyền lợi gì và banner mua hàng hiện ra sao:

| type | Quyền lợi | Banner ở khối mua hàng |
|---|---|---|
| `bundle` | Dùng thử khi đăng ký **và** +% thời gian khi mua | Hiện cả 2 |
| `trial` | Chỉ dùng thử khi đăng ký | Hiện thông báo dùng thử |
| `purchase_bonus` | Chỉ +% thời gian khi mua | Hiện "+% thời gian" |
| `announcement` | Không có quyền lợi — chỉ thông báo | Hiện headline thuần |

Luật quyền lợi (theo từng đợt):
- **Dùng thử:** đăng ký TRONG cửa sổ của đợt có trial (bundle/trial) → cấp ngay license dùng thử (mặc định Plus 7 ngày, hạn đếm từ lúc kích hoạt). Mỗi tài khoản 1 lần/1 đợt (đánh dấu `promo:<id>` trong license).
- **+% mua gói:** tài khoản đăng ký trong cửa sổ của đợt có bonus (bundle/purchase_bonus) VÀ mua trong cửa sổ → cộng % vào ngày của license (50%: tháng 30→45 ngày, năm 365→548 ngày). Số ngày tặng ghi ở `orders.bonus_days`, Lịch sử hiện "+15 ngày KM".

## Banner chạy ở trang chủ (ticker)
- Nằm **trong header cố định, trên cùng của trang** (trên cả menu và phần hero "Từ ảnh sản phẩm đến video quảng cáo.") — luôn ghim ở top khi cuộn.
- Lấy dữ liệu từ `GET /api/promo` (trường `promos` = các đợt **đang chạy**), **không hard-code**: có bao nhiêu đợt đang chạy thì bấy nhiêu thông báo, **tự chuyển lần lượt mỗi 4,5 giây** (di chuột vào thì dừng). Mỗi thông báo hiện `headline` + link (nếu có) + số ngày còn lại của đợt đó.
- Không có đợt nào đang chạy → ticker tự ẩn, header về chiều cao bình thường.

## Đổi cấu hình (KHÔNG cần deploy code)
Xem cấu hình đang dùng:
```
curl https://hora.works/api/internal/promo -H "X-Identity-Secret: <SECRET>"
```
Ghi danh sách mới (thay toàn bộ danh sách):
```
curl -X POST https://hora.works/api/internal/promo \
  -H "X-Identity-Secret: <SECRET>" -H "Content-Type: application/json" \
  -d '{"promotions":[
    {"id":"thang-11-2026","type":"bundle","name":"Ưu đãi tháng 11",
     "headline":"Tháng 11: đăng ký mới dùng thử Plus 7 ngày + mua gói tặng 50% thời gian",
     "link":"/account.html?mode=register",
     "startsAt":"2026-11-01T00:00:00+07:00","endsAt":"2026-12-01T00:00:00+07:00",
     "trialTier":"plus","trialDays":7,"purchaseBonusPercent":50},
    {"id":"thong-bao-1","type":"announcement","name":"Thông báo",
     "headline":"Thông báo muốn chạy kèm ở banner...",
     "startsAt":"2026-11-01T00:00:00+07:00","endsAt":"2026-12-01T00:00:00+07:00"}
  ]}'
```
(`<SECRET>` = `IDENTITY_INTERNAL_SECRET` của Pages. Cũng sửa trực tiếp được dòng `meta` key `promotions` trong D1 Console.)
Chưa có dòng `promotions` nào thì hệ thống dùng mặc định trong `functions/api/_promo.js` (đợt tháng 11 dạng `bundle`). Cấu hình cũ dạng đơn (key `promotion`) vẫn đọc tương thích.

## Cần làm khi lên production lần đầu
1. Chạy migration `db/migrate-promo-2026-10-30.sql` trên D1 `hora-website` (thêm cột `orders.bonus_days`; chưa chạy vẫn cấp đúng ngày tặng, chỉ không ghi lại số ngày tặng).
2. Deploy code như bình thường — mặc định đã là đợt tháng 11, không cần đặt cấu hình thêm.
