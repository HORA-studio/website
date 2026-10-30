# Khuyến mãi — cách vận hành & cách đổi cấu hình

## Đợt mặc định: "Ưu đãi tháng 11"
- **Thời gian:** tài khoản đăng ký trong **[01/11/2026 00:00, 01/12/2026 00:00)** giờ Việt Nam (tháng 11 chỉ có 30 ngày — cửa sổ kết thúc ở đầu ngày 01/12).
- **Quyền lợi 1 — dùng thử:** đăng ký trong cửa sổ → cấp ngay 1 license **Plus dùng thử 7 ngày** (hạn đếm từ lúc kích hoạt/gắn máy như mọi license; hiện trong tab Lịch sử giao dịch với nhãn "Dùng thử").
- **Quyền lợi 2 — +50% thời gian:** tài khoản đăng ký trong cửa sổ, khi **mua gói trong cửa sổ** thì license được cộng 50% ngày: gói tháng 30 → **45 ngày**, gói năm 365 → **548 ngày**. Số ngày tặng ghi ở `orders.bonus_days` và hiện trong Lịch sử dạng "+15 ngày KM".

## Cấu hình nằm ở đâu (đổi KHÔNG cần deploy code)
Cấu hình là 1 dòng JSON trong bảng `meta` của D1 `hora-website`, key = `promotion`.
Chưa có dòng này thì hệ thống dùng cấu hình mặc định trong `functions/api/_promo.js` (đúng đợt tháng 11 ở trên).

Các trường: `enabled` (bật/tắt), `name`, `headline` (dòng chữ hiện trên web),
`startsAt` / `endsAt` (ISO 8601 có múi giờ, vd `2026-11-01T00:00:00+07:00`),
`trialTier` (`plus`/`go`), `trialDays`, `purchaseBonusPercent`.

### Xem cấu hình đang dùng
```
curl https://hora.works/api/internal/promo -H "X-Identity-Secret: <SECRET>"
```
(`<SECRET>` = `IDENTITY_INTERNAL_SECRET` của Pages.)

### Đổi cấu hình (gửi một phần cũng được — phần còn thiếu giữ nguyên)
```
curl -X POST https://hora.works/api/internal/promo \
  -H "X-Identity-Secret: <SECRET>" -H "Content-Type: application/json" \
  -d '{"endsAt":"2026-12-15T00:00:00+07:00","purchaseBonusPercent":30}'
```
Ví dụ tắt khuyến mãi: `-d '{"enabled":false}'`. Đợt mới: đổi `name`, `headline`, `startsAt`, `endsAt`, `trialDays`, `purchaseBonusPercent` theo ý.
Cũng có thể sửa trực tiếp dòng `meta` này trong D1 Console của Cloudflare.

## Web hiển thị gì
- `GET /api/promo` (công khai): trang chủ hiện thanh banner trên cùng + nhãn "+50% thời gian sử dụng" ở 2 thẻ giá khi đợt đang chạy.
- Tài khoản: tab Mua gói hiện dải thông báo cá nhân hoá (đủ điều kiện hay không, còn mấy ngày, có trial chưa) + dòng thực nhận dưới giá (45/548 ngày) cho người đủ điều kiện.
- Ngoài thời gian chạy, mọi phần tử khuyến mãi tự ẩn, đăng ký/mua gói chạy như bình thường.

## Cần làm khi lên production lần đầu
1. Chạy migration `db/migrate-promo-2026-10-30.sql` trên D1 `hora-website` (thêm cột `orders.bonus_days`; chưa chạy thì hệ thống vẫn cấp license đúng ngày tặng, chỉ không ghi lại số ngày tặng).
2. Deploy code như bình thường. Không cần đặt cấu hình gì thêm nếu giữ nguyên đợt tháng 11.
