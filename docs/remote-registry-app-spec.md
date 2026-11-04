# Web Remote — việc phía APP để mục Remote trong tài khoản chạy thật

> Trạng thái: phần WEBSITE đã code xong (xem `docs/web-remote.md` mục 0).
> File này là hợp đồng cho phía app desktop (repo app ở máy local của user)
> áp theo. Không có 3 việc dưới đây thì mục Remote trên web sẽ báo
> "không tìm thấy máy" (chưa đăng ký) hoặc "không gọi được app" (chưa CORS).

## 1. Đăng ký Tunnel + mã ghép lên website (mới, bắt buộc cho luồng nhập mã)

Khi app mở Remote (đã có URL Tunnel + mã ghép 6 số), app gọi:

```
POST https://hora.works/api/app/remote-register
Content-Type: application/json

{
  "appToken": "<token app đang giữ sau khi kết nối tài khoản>",
  "tunnelUrl": "https://xxxx.trycloudflare.com",
  "code": "482916",
  "deviceName": "DESKTOP-01",
  "deviceId": "<deviceId của máy>",
  "app": "video-builder"
}
```

- Xác thực: `appToken` như trên, **hoặc** worker gọi server-to-server bằng
  header `X-Identity-Secret` + `userId` trong body (giống bootstrap).
- Đáp thành công `200`: `{ ok, expiresAt, ttlSeconds: 600, connectUrl }`.
  - `connectUrl` = `https://hora.works/account.html?remote_code=<mã>` —
    app **hiện link này làm QR** cạnh mã 6 số (xem mục 2).
  - Mã chỉ sống **10 phút**: app phải gọi lại register để gia hạn (mỗi lần
    gọi reset hạn 10 phút, đồng thời cập nhật URL/mã nếu đổi), và gọi
    `POST /api/app/remote-unregister` (cùng xác thực, body `{}` + token)
    khi tắt Remote / đóng app.
- Lỗi: `401` token sai/thu hồi · `422 INVALID_TUNNEL_URL` (URL phải là
  https; chỉ test local mới nhận `http://127.0.0.1`) · `422 INVALID_CODE`
  (mã không đúng 6 chữ số) · `500 REGISTER_FAILED` (D1 chưa chạy migration
  `db/migrate-remote-2026-11-04.sql` — việc của user ở production).

## 2. Hiện QR + mã trên app

- Cạnh mã ghép 6 số hiện tại, hiện thêm QR của `connectUrl` ở trên.
- User quét QR bằng camera thường → mở đúng mục Remote trên web, mã tự
  điền. User ở sẵn trong mục Remote thì quét ngay trong trang (web dùng
  BarcodeDetector) hoặc gõ tay 6 số.
- QR chỉ chứa link + mã ngắn hạn, không chứa token/Tunnel thô.

## 3. CORS cho origin của website (điều kiện tiên quyết, đã ghi ở spec chính mục 10)

Sau khi web tra được Tunnel, trình duyệt tại `https://hora.works` gọi
thẳng sang Tunnel: `POST /remote/pair`, `GET /remote/pair/status`, mọi
route `/remote/*` và WebSocket `/remote/live`. Server nhúng trong app
phải trả CORS cho origin `https://hora.works` (kèm xử lý preflight
`OPTIONS` và header `Authorization`), và nới kiểm tra `Origin` của
WebSocket cho cùng origin đó. Chưa có CORS thì web báo rõ "không gọi
được app qua Tunnel" — luồng dừng ở đúng bước này.

## Luồng hoàn chỉnh (để đối chiếu khi test)

1. Mở app → app có Tunnel + mã → app register lên website.
2. User đăng nhập hora.works (điện thoại/máy khác) → mục **Remote** →
   quét QR hoặc nhập mã 6 số.
3. Web gọi `/api/remote/lookup` → nhận `tunnelUrl` của chính tài khoản.
4. Web gọi `POST {tunnelUrl}/remote/pair {account, code}` → user duyệt
   trên máy tính → web poll `/remote/pair/status` mỗi 3s → nhận token
   64 hex → lưu localStorage (`hora.remote.baseUrl` / `hora.remote.token`
   / `hora.remote.deviceName`).
5. Web mở **shell điều khiển native ngay trong mục Remote** bằng
   base + token đã lưu (ĐÃ CODE 2026-11-04 ~22:57 theo chốt của user:
   dựng theo hợp đồng API, không chờ WR-10, không mở link Tunnel —
   xem `docs/web-remote.md` mục 0). Phía app chỉ cần giữ đúng hợp đồng
   API ở mục 3 (CORS) + các route `/remote/*`; trang nhúng của app
   không còn nằm trong luồng chính nữa.

## Handoff token cho trang nhúng của app (bổ sung 2026-11-04)

Vấn đề: token ghép nối chỉ nằm trong `localStorage` của origin
`hora.works`. Trang nhúng của app chạy ở origin Tunnel khác, không đọc
được — nếu web chỉ mở `{tunnelUrl}/` trần, trang app không biết trình
duyệt đã ghép nối và lại hiện màn ghép nối (W0/W1) từ đầu: user phải
ghép 2 lần, thừa một view.

Cách chốt: nút "Mở trang điều khiển của app" trên website mở
`{tunnelUrl}/#token=<token 64 hex>` (fragment — trình duyệt KHÔNG gửi
fragment trong HTTP request tới server/Tunnel, không vào log phía
server). Phía app (trang nhúng) PHẢI làm 4 việc khi tải trang:

1. Đọc `location.hash`, nếu có tham số `token` thì lấy ra và lưu vào
   `localStorage` của chính origin app (cùng khóa/nơi trang vẫn dùng
   cho phiên điều khiển).
2. Xoá fragment khỏi thanh địa chỉ ngay (`history.replaceState` về
   `/`) để token không nằm lại trong lịch sử/URL.
3. Kiểm chứng token bằng `GET /remote/status` kèm
   `Authorization: Bearer <token>`: đạt thì vào thẳng shell điều
   khiển, BỎ QUA màn W0/W1; nhận 401 thì xoá token và hiện màn ghép
   nối như cũ.
4. Không có fragment (mở trực tiếp từ app) thì giữ nguyên luồng cũ.

Cập nhật 2026-11-04 ~22:57: website ĐÃ có shell điều khiển native
(đợt trên) nên handoff này **không còn cần cho luồng website nữa** và
nút mở trang app đã bị gỡ khỏi website. Mục này chỉ còn giá trị nếu
user tự mở trực tiếp trang nhúng của app ở ngoài website.
