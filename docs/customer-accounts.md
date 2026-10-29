Trạng thái: ĐÃ implement code + ĐÃ kiểm chứng local (node --check toàn bộ file JS mới; unit test hàm ký MoMo/VNPay, checksum và PBKDF2; chạy thật `wrangler pages dev` với D1 local — đăng ký/đăng nhập/đăng xuất, nhận license bằng key, tạo đơn, IPN VNPay ký đúng/sai/lặp đều đúng kỳ vọng). CHƯA deploy, CHƯA push, giá bán CHƯA chốt, merchant MoMo/VNPay CHƯA có, endpoint cấp license phía hệ license CHƯA implement.

# Tài khoản khách + dashboard + thanh toán tự động (website)

## Phạm vi quản trị — đọc trước

**Tài khoản khách, đơn hàng và giao dịch chỉ được quản lý trên website**
(Pages Functions + D1 `hora-core` của chính repo này). **HORA.Admin — app
desktop quản trị license — KHÔNG quản lý tài khoản khách**, không có màn hình
cho việc này và không nằm trong luồng mua hàng. Hai hệ tách bạch:

- Website: khách đăng ký/đăng nhập, mua, xem tier license của mình, xem lịch
  sử giao dịch của mình.
- Hệ license (`api.hora.works` + HORA.Admin): chỉ phía admin cấp/quản lý
  license như hiện tại. Điểm chạm duy nhất giữa hai hệ là endpoint nội bộ cấp
  license cho đơn web — hiện mới là **đặc tả trên giấy** ở
  `docs/customer-license-issue-endpoint.md`, chưa implement.

## Kiến trúc

```
Trình duyệt ── /account.html (tĩnh, cùng origin)
            └─ /api/* (Cloudflare Pages Functions, repo này)
                 ├─ auth: register / login / logout / me
                 ├─ licenses: GET danh sách, POST claim key đã có
                 ├─ orders: POST tạo đơn, GET lịch sử giao dịch
                 └─ payments: MoMo IPN / VNPay IPN / return redirect
            D1 "hora-core" (binding DB trong wrangler.toml): db/schema.sql
            Cổng ngoài: MoMo (tạo thanh toán qua API), VNPay (URL redirect)
            Hệ license: chỉ khi LICENSE_ISSUE_URL/SECRET được cấu hình
```

- **Mật khẩu:** PBKDF2-SHA256, 100.000 vòng, salt ngẫu nhiên riêng từng khách
  (WebCrypto). Không bao giờ lưu/log mật khẩu tho.
- **Session:** cookie `hora_session` (HttpOnly + Secure + SameSite=Lax, 30
  ngày); phía server chỉ lưu SHA-256 của token trong bảng `sessions`.
- **License đã có (claim):** khách dán key -> chỉ lưu SHA-256 của key, không
  lưu key tho. Hệ license chưa có endpoint tra cứu key cho website nên
  tier/hạn dùng của key claim là `NULL` — dashboard hiển thị **"Chưa đồng
  bộ"**, không suy đoán.
- **License mua qua web:** sau khi IPN xác nhận đã trả tiền, website gọi
  endpoint nội bộ cấp license (xem bản spec) nếu đã cấu hình. Key được cấp
  được lưu cả bản tho trong `customer_licenses.license_key_plain` **chỉ với
  key do mua** để khách copy từ dashboard của chính họ — đây là đánh đổi có
  chủ đích (key claim thì không có bản tho). Chưa cấu hình endpoint -> đơn ở
  trạng thái `paid_pending_issue` (đã thu tiền, chờ cấp) chứ không bịa key.
- **IPN là nơi duy nhất được ghi "đã thanh toán"**, sau khi đã (1) xác minh
  chữ ký/checksum của cổng và (2) đối chiếu số tiền với đơn đã lưu. Trang
  `return` chỉ điều hướng về `/account.html`, không ghi trạng thái gì.
- **Giá:** object `PLANS` ở 3 nơi phải khớp nhau — `index.html`,
  `account.html`, `functions/api/_lib.js` (phía server là nơi quyết định số
  tiền đơn). Hiện cả 3 đều `null` (chưa chốt giá) -> nút mua bị khóa, API tạo
  đơn trả `422 PRICE_NOT_SET`. Biến `PRICE_GO_MONTH` v.v. chỉ là override để
  test local/staging, không dùng cho production.
- Stripe **không** dùng: Stripe không onboard merchant có trụ sở tại Việt
  Nam. Kiến trúc cổng nằm ở `functions/api/payments/_gateway.js` để sau này
  thêm cổng khác.

## Áp schema vào D1 thật (cần đăng nhập Cloudflare của user)

```bash
npx wrangler d1 execute hora-core --remote --file db/schema.sql
```

(Lệnh `--local` chỉ áp vào D1 giả lập trên máy để test. Việc `--remote` tạo
bảng trên database `hora-core` thật — Muse không có đăng nhập Cloudflare
của user nên chưa chạy lệnh này.)

## Biến môi trường / secret của Pages project

Đặt bằng `wrangler pages secret put <TÊN>` (secret) — không commit giá trị
vào repo:

| Tên | Bắt buộc cho | Ghi chú |
| --- | --- | --- |
| `MOMO_PARTNER_CODE` | MoMo | Mã đối tác MoMo cấp |
| `MOMO_ACCESS_KEY` | MoMo | Access key MoMo cấp |
| `MOMO_SECRET_KEY` | MoMo | Secret — chỉ dùng để ký HMAC-SHA256 |
| `MOMO_ENV` | MoMo | `test` (mặc định) hoặc `production` |
| `VNPAY_TMN_CODE` | VNPay | Mã website (Terminal ID) VNPay cấp |
| `VNPAY_HASH_SECRET` | VNPay | Secret key để tính checksum HMAC-SHA512 |
| `VNPAY_ENV` | VNPay | `test` (mặc định) hoặc `production` |
| `LICENSE_ISSUE_URL` | Cấp license tự động | URL endpoint nội bộ — xem bản spec, chưa tồn tại |
| `LICENSE_ISSUE_SECRET` | Cấp license tự động | Shared secret với hệ license, chưa tồn tại |

Thiếu biến của cổng nào thì tạo đơn qua cổng đó trả
`503 GATEWAY_NOT_CONFIGURED` và đơn nằm ở trạng thái `created` — hệ thống
không tạo URL thanh toán giả.

URL cần đăng ký với từng cổng (khi có merchant):

- MoMo IPN: `https://<domain web>/api/payments/momo-ipn`
- VNPay IPN: `https://<domain web>/api/payments/vnpay-ipn`
- Trang quay về (cả hai cổng): `https://<domain web>/api/payments/return`

## Lấy thông tin merchant

- **MoMo:** ký hợp đồng đối tác kinh doanh với MoMo (cổng thanh toán cho
  doanh nghiệp) -> được cấp `partnerCode`, `accessKey`, `secretKey`. Có môi
  trường test (`test-payment.momo.vn`, app MoMo test) để đối soát IPN trước,
  sau đó mới chuyển bộ key production (`payment.momo.vn`, `MOMO_ENV=production`).
- **VNPay:** đăng ký merchant với VNPay / ngân hàng liên kết -> được cấp
  `vnp_TmnCode` và `vnp_HashSecret`. Có môi trường sandbox
  (`sandbox.vnpayment.vn`, thẻ test do VNPay cung cấp) trước khi lấy bộ
  production (`pay.vnpay.vn`, `VNPAY_ENV=production`).

## Checklist mở bán (go-live)

1. [ ] User chốt giá thật -> điền vào `PLANS` ở cả 3 nơi (`index.html`,
   `account.html`, `functions/api/_lib.js`) — bỏ khóa nút mua ở trang chủ.
2. [ ] Áp `db/schema.sql` lên D1 `hora-core` thật (`--remote`, cần đăng nhập
   Cloudflare của user).
3. [ ] Có merchant MoMo và/hoặc VNPay -> đặt các secret ở trên cho Pages
   project, đăng ký URL IPN với cổng, test 1 đơn giá nhỏ ở môi trường test.
4. [ ] Implement endpoint cấp license phía hệ license theo
   `docs/customer-license-issue-endpoint.md` (việc riêng phía Worker prod,
   không thuộc repo này) -> đặt `LICENSE_ISSUE_URL` / `LICENSE_ISSUE_SECRET`.
   Trước bước này, đơn trả tiền thành công vẫn bán được nhưng license phải
   cấp tay theo trạng thái `paid_pending_issue`.
5. [ ] Deploy: push nhánh + merge/deploy Pages như quy trình website hiện tại.

## Đã kiểm chứng local (2026-10-29, trên VM này)

- `node --check` (qua bản sao `.mjs`): đạt cả 12 file JS mới.
- Unit test node cho các hàm thuần: PBKDF2 roundtrip (đúng/sai mật khẩu),
  vector SHA-256 + HMAC-SHA256 chuẩn, thứ tự field trong chuỗi ký MoMo
  (create + IPN), VNPay build URL -> verify checksum đạt, sửa số tiền bị từ
  chối, format ngày GMT+7. **Đạt toàn bộ.**
- `wrangler pages dev` (wrangler 4.155) + D1 local đã áp schema, curl đủ
  luồng: đăng ký 201 -> `me` 200 -> đăng ký trùng email 409 -> claim key
  đúng định dạng 201 (tier null = "Chưa đồng bộ") / sai định dạng 422 ->
  tạo đơn gói Plus (giá null) 422 `PRICE_NOT_SET` -> tạo đơn gói Go với giá
  override **chỉ ở local** + chưa có merchant -> 503 `GATEWAY_NOT_CONFIGURED`
  (đơn vẫn được tạo) -> lịch sử giao dịch liệt kê đúng -> đăng xuất rồi `me`
  401 -> đăng nhập sai mật khẩu 401 / đúng 200.
- VNPay e2e với thông tin merchant **giả để test**: tạo đơn -> có URL
  sandbox -> IPN ký đúng -> trả `{"RspCode":"00"}` và đơn chuyển
  `paid_pending_issue` (đúng kỳ vọng vì chưa có endpoint cấp license) ->
  IPN bị sửa số tiền -> `97` -> gọi IPN lặp lại -> `02` (đã xác nhận, không
  xử lý trùng).
- **Chưa** kiểm chứng: thanh toán tiền thật với MoMo (tạo thanh toán cần gọi
  API MoMo bằng merchant thật — chưa có), deploy lên Cloudflare, D1 remote.
