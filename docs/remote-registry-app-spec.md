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
5. Web mở view điều khiển (shell port từ WR-10 — đợt sau) bằng
   base + token đã lưu; hiện tại hiện trạng thái đã kết nối + nút mở
   trang điều khiển nhúng của app tại `{tunnelUrl}/`.
