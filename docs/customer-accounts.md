Trạng thái: ĐÃ implement code + ĐÃ kiểm chứng local (node --check toàn bộ file JS mới; unit test hàm ký MoMo/VNPay, checksum và PBKDF2; chạy thật `wrangler pages dev` với D1 local — đăng ký/đăng nhập/đăng xuất, nhận license bằng key, tạo đơn, IPN VNPay ký đúng/sai/lặp đều đúng kỳ vọng). ĐÃ thêm SePay làm cổng chính (2026-10-29) + kiểm chứng local tương tự (tạo đơn ra hướng dẫn chuyển khoản + QR, webhook sai key 401 / lệch tiền / đúng mã+tiền / trùng giao dịch đều đúng kỳ vọng). CHƯA deploy, CHƯA push, GIÁ TẠM đã áp 2026-10-29 (Go 250.000đ/tháng, 2.500.000đ/năm; Plus 400.000đ/tháng, 4.000.000đ/năm — GIÁ TẠM, chờ giá thật), tài khoản SePay + merchant MoMo/VNPay CHƯA có, endpoint cấp license phía hệ license CHƯA implement.

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
                 └─ payments: SePay webhook / MoMo IPN / VNPay IPN / return redirect
            D1 "hora-core" (binding DB trong wrangler.toml): db/schema.sql
            Cổng ngoài: SePay (webhook sau chuyển khoản — cổng chính),
                        MoMo (tạo thanh toán qua API), VNPay (URL redirect)
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
- **Giá:** object `PLANS` ở 2 nơi phải khớp nhau — `index.html` và
  `functions/api/_lib.js` (phía server là nơi quyết định số tiền đơn).
  `account.html` tự lấy giá qua `GET /api/plans` (Pages Function
  `functions/api/plans.js`, trả đúng `getPlans(env)`) nên tự động theo server,
  chỉ còn bản sao dự phòng khi fetch lỗi. **GIÁ TẠM đã áp (user chốt tạm
  2026-10-29, chờ giá thật): Go 250.000đ/tháng, 2.500.000đ/năm; Plus
  400.000đ/tháng, 4.000.000đ/năm** — đã điền vào cả 2 bản sao bắt buộc +
  bản sao dự phòng trong `account.html`. Nút mua ở trang chủ đã mở ("Chọn
  gói", chuyển thẳng sang `/account.html?plan=<go|plus>&period=<month|year>`
  để checkout thật), API tạo đơn dùng đúng số tiền này (không còn trả
  `422 PRICE_NOT_SET`). Đổi giá = sửa `PLANS` ở 2 nơi bắt buộc trên
  (`account.html` tự theo server qua `/api/plans`; nhớ sửa cả bản sao dự
  phòng của nó cho khớp). Biến `PRICE_GO_MONTH` v.v. chỉ là override để
  test local/staging, không dùng cho production.
- Stripe **không** dùng: Stripe không onboard merchant có trụ sở tại Việt
  Nam. Kiến trúc cổng nằm ở `functions/api/payments/_gateway.js` để sau này
  thêm cổng khác.

## SePay — cổng chính (user chốt 2026-10-29)

SePay không có trang thanh toán redirect như MoMo/VNPay. Luồng:

1. Khách đăng nhập, chọn gói -> website tạo đơn + một **mã thanh toán riêng**
   dạng `HORA` + 8 ký tự (lấy từ mã đơn, lưu ở `payments.gateway_order_id`),
   trả về **hướng dẫn chuyển khoản**: ngân hàng, số tài khoản, chủ tài khoản,
   số tiền đúng, nội dung = mã thanh toán, kèm ảnh QR VietQR
   (`img.vietqr.io/image/<BIN>-<số tài khoản>-compact2.png?amount=…&addInfo=<mã>`)
   để khách quét bằng app ngân hàng. Có sẵn hướng dẫn dạng chữ nếu dịch vụ
   ảnh QR lỗi.
2. Khách chuyển khoản ngân hàng vào tài khoản người bán, ghi đúng mã vào
   nội dung.
3. SePay quét biến động tài khoản đó rồi gọi **webhook**
   `POST https://hora.works/api/payments/sepay-webhook`, xác thực bằng header
   `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`.
4. Webhook đối chiếu: tìm phiên thanh toán theo mã (ưu tiên field `code`,
   không có thì quét `content`/`description` sau khi chuẩn hóa viết hoa + bỏ
   ký tự lạ) và yêu cầu `transferAmount` **bằng đúng** `amount_vnd` của đơn.
   Lệch tiền -> ghi `payments` trạng thái `amount_mismatch`, không ghi paid.
   Trùng id giao dịch SePay -> trả `duplicate:true`, không xử lý lại. Khớp
   -> đơn `paid` + `paid_at`, rồi gọi cấp license như các cổng khác (chưa có
   endpoint cấp -> `paid_pending_issue`).
5. Trang tài khoản tự hỏi lại `GET /api/orders` mỗi 15 giây (tối đa ~10
   phút) để báo khách khi tiền đã về.

**Cài đặt SePay (user tự làm — cần tài khoản ngân hàng của người bán):**

1. Đăng ký tài khoản tại **sepay.vn** và liên kết tài khoản ngân hàng nhận
   tiền vào SePay.
2. Trong SePay, tạo webhook trỏ tới
   `https://hora.works/api/payments/sepay-webhook`, kiểu xác thực **API Key**;
   lấy API key SePay cấp.
3. Đặt cùng API key đó vào biến `SEPAY_WEBHOOK_API_KEY` của Pages project
   (xem bảng biến bên dưới), và điền `SEPAY_BANK_NAME` (tên ngân hàng),
   `SEPAY_BANK_BIN` (mã BIN số, ví dụ MB là `970422`), `SEPAY_ACCOUNT_NUMBER`,
   `SEPAY_ACCOUNT_NAME` — đúng tài khoản đã liên kết SePay, vì mã QR VietQR
   được tạo từ các giá trị này.
4. Thiếu các biến ngân hàng -> tạo đơn SePay trả `503 GATEWAY_NOT_CONFIGURED`
   như các cổng khác; thiếu API key -> webhook trả 503.

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
| `SEPAY_BANK_NAME` | SePay (cổng chính) | Tên ngân hàng nhận tiền, hiển thị cho khách |
| `SEPAY_BANK_BIN` | SePay | Mã BIN số của ngân hàng (ví dụ MB `970422`) — dùng tạo QR VietQR |
| `SEPAY_ACCOUNT_NUMBER` | SePay | Số tài khoản nhận tiền (đã liên kết SePay) |
| `SEPAY_ACCOUNT_NAME` | SePay | Tên chủ tài khoản |
| `SEPAY_WEBHOOK_API_KEY` | SePay webhook | API key đặt trong cấu hình webhook ở SePay; website so khớp header `Authorization: Apikey …` — secret, không log |
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

## File credential trên máy Muse (quy ước đặt tên)

Mọi file bí mật dùng cho dự án đều nằm ở thư mục home của máy Muse, tên bắt
đầu bằng `~/.hora_`, quyền `0600`. Tài liệu này chỉ ghi **tên file + công
dụng** — **giá trị bí mật không bao giờ ghi vào repo, chat hay log**.

| File | Chứa gì | Dùng để làm gì | Trạng thái |
| --- | --- | --- | --- |
| `~/.hora_github_token` | GitHub fine-grained PAT (Contents R+W) | Muse push/pull các repo `HORA-studio` | ĐÃ CÓ |
| `~/.hora_cloudflare_token` | Cloudflare API token (Account: D1 Edit + Pages Edit) | Muse áp schema D1 + nạp secret cho Pages khi deploy | CHƯA TẠO |
| `~/.hora_sepay_key` | API key webhook SePay (dãy user tự đặt trong cấu hình webhook ở SePay) | Muse nạp vào biến `SEPAY_WEBHOOK_API_KEY` của Pages | CHƯA TẠO |

Cách user tạo 2 file chưa có (chạy trên máy Muse, thay phần trong `<>` bằng
giá trị thật, xong nhắn Muse "done"):

```bash
cat > ~/.hora_cloudflare_token <<'EOF'
<token Cloudflare>
EOF
chmod 600 ~/.hora_cloudflare_token

cat > ~/.hora_sepay_key <<'EOF'
<API key SePay>
EOF
chmod 600 ~/.hora_sepay_key
```

URL cần đăng ký với từng cổng (khi có merchant):

- SePay webhook: `https://hora.works/api/payments/sepay-webhook` (xác thực API Key)
- MoMo IPN: `https://<domain web>/api/payments/momo-ipn`
- VNPay IPN: `https://<domain web>/api/payments/vnpay-ipn`
- Trang quay về (cả hai cổng): `https://<domain web>/api/payments/return`

## Lấy thông tin merchant

- **SePay (làm trước):** đăng ký tại sepay.vn, liên kết tài khoản ngân hàng
  nhận tiền, tạo webhook về website và lấy API key — xem mục "SePay — cổng
  chính" ở trên. Không cần hợp đồng merchant như MoMo/VNPay, có thể mở bán
  ngay khi có giá.
- **MoMo (tùy chọn, làm sau):** ký hợp đồng đối tác kinh doanh với MoMo (cổng thanh toán cho
  doanh nghiệp) -> được cấp `partnerCode`, `accessKey`, `secretKey`. Có môi
  trường test (`test-payment.momo.vn`, app MoMo test) để đối soát IPN trước,
  sau đó mới chuyển bộ key production (`payment.momo.vn`, `MOMO_ENV=production`).
- **VNPay:** đăng ký merchant với VNPay / ngân hàng liên kết -> được cấp
  `vnp_TmnCode` và `vnp_HashSecret`. Có môi trường sandbox
  (`sandbox.vnpayment.vn`, thẻ test do VNPay cung cấp) trước khi lấy bộ
  production (`pay.vnpay.vn`, `VNPAY_ENV=production`).

## Checklist mở bán (go-live)

1. [x] GIÁ TẠM đã điền 2026-10-29 (Go 250.000đ/tháng, 2.500.000đ/năm;
   Plus 400.000đ/tháng, 4.000.000đ/năm), nút mua trang chủ đã mở và nối
   checkout thật ở `/account.html`. [ ] Khi user chốt GIÁ THẬT: sửa lại
   `PLANS` ở 2 nơi (`index.html`, `functions/api/_lib.js`) + bản sao dự
   phòng trong `account.html`.
2. [ ] Áp `db/schema.sql` lên D1 `hora-core` thật (`--remote`, cần đăng nhập
   Cloudflare của user).
3. [ ] **SePay trước:** đăng ký sepay.vn + liên kết tài khoản ngân hàng +
   tạo webhook (API Key) -> đặt 5 biến `SEPAY_*` cho Pages project -> test
   1 đơn thật giá nhỏ (chuyển khoản đúng mã + đúng số tiền, xem đơn chuyển
   `paid_pending_issue`).
4. [ ] MoMo/VNPay (tùy chọn, sau): có merchant -> đặt các secret tương ứng
   cho Pages project, đăng ký URL IPN với cổng, test 1 đơn giá nhỏ ở môi
   trường test.
5. [ ] Implement endpoint cấp license phía hệ license theo
   `docs/customer-license-issue-endpoint.md` (việc riêng phía Worker prod,
   không thuộc repo này) -> đặt `LICENSE_ISSUE_URL` / `LICENSE_ISSUE_SECRET`.
   Trước bước này, đơn trả tiền thành công vẫn bán được nhưng license phải
   cấp tay theo trạng thái `paid_pending_issue`.
6. [ ] Deploy: push nhánh + merge/deploy Pages như quy trình website hiện tại.

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

## Đã kiểm chứng local — SePay (2026-10-29, bổ sung)

- `node --check` (bản sao `.mjs`): đạt cho các file mới/sửa (`plans.js`,
  `sepay-webhook.js`, `_gateway.js`, `orders/index.js`, `_lib.js` + các
  handler sẵn có).
- Unit test node cho helper SePay: mã thanh toán ổn định/duy nhất theo đơn
  (đúng mẫu `HORA` + 8 ký tự), chuẩn hóa nội dung (viết hoa, bỏ ký tự lạ),
  tìm mã trong nội dung chứa chữ thừa/dấu cách, URL QR VietQR đúng mẫu
  (`970422-…-compact2.png?amount=…&addInfo=<mã>&accountName=…`). **Đạt.**
- `wrangler pages dev` + D1 local với biến test (`PRICE_GO_MONTH` override
  chỉ-local + `SEPAY_*` giả): `GET /api/plans` trả giá server -> đăng ký/me
  -> tạo đơn SePay 201, trả `payment_instructions` đủ ngân hàng/số tài
  khoản/số tiền/mã `HORA…` + `qr_url`, đơn `awaiting_payment` -> webhook
  không key / sai key -> **401** -> webhook đúng key (header
  `X-SePay-Api-Key`) nhưng lệch số tiền -> `matched:false,
  reason:'amount_mismatch'`, đơn vẫn `awaiting_payment` -> webhook đúng mã
  (tìm qua quét `content`, chữ thường) + đúng tiền -> `{success:true}`, đơn
  thành `paid_pending_issue`, có `paid_at` -> gửi lại cùng id giao dịch ->
  `duplicate:true` -> mã lạ -> `matched:false` -> `transferType:'out'` ->
  `ignored` -> đăng xuất/`me` 401/đăng nhập sai 401/đúng 200 (không hồi
  quy auth).
- Chạy instance riêng KHÔNG đặt biến SePay: tạo đơn -> **503
  `GATEWAY_NOT_CONFIGURED`** (đơn `created`, không có hướng dẫn giả);
  webhook -> **503** `{success:false}` vì chưa đặt `SEPAY_WEBHOOK_API_KEY`.
- **Chưa** kiểm chứng: tiền thật qua SePay (cần tài khoản SePay thật liên
  kết ngân hàng của user + webhook thật trên domain đã deploy).

## Đã kiểm chứng local — GIÁ TẠM (2026-10-29, bổ sung)

- Grep toàn bộ bản sao `PLANS` (`index.html`, `account.html`,
  `functions/api/_lib.js`): không còn `month/year: null`.
- `node --check`: đạt cho `_lib.js`, `plans.js`, JS inline của
  `account.html` (gồm handler `applyPreselect` mới) và block script chính
  của `index.html` (gồm handler nút mua mới chuyển sang
  `/account.html?plan=…&period=…`). Diff `index.html` chỉ 5 hunk nhỏ.
- `wrangler pages dev` + D1 local, KHÔNG đặt biến `PRICE_*`/`SEPAY_*`:
  `GET /api/plans` trả đúng giá tạm (Go 250000/2500000, Plus
  400000/4000000) -> đăng ký 201 -> `me` 200 -> tạo đơn SePay gói Go/1
  tháng -> **503 `GATEWAY_NOT_CONFIGURED`** (đúng kỳ vọng vì chưa có tài
  khoản SePay) và đơn được tạo với `amountVnd = 250000`, trạng thái
  `created` — **không còn `422 PRICE_NOT_SET`**; đơn Plus/1 năm có
  `amountVnd = 4000000` -> lịch sử giao dịch liệt kê đúng số tiền -> đăng
  nhập sai 401 / đúng 200. Đã dọn `.wrangler/` local sau test.
