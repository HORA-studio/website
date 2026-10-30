Trạng thái: ĐÃ implement + ĐÃ deploy web (`hora.works`) — tài khoản khách, license/device, **Identity Provider cho app desktop** (kết nối tài khoản bằng link code), checkout SePay. ĐÃ kiểm chứng local (`wrangler pages dev` + D1 local) cho toàn bộ luồng link + license + bootstrap + device-change + cooldown. GIÁ TẠM đã áp 2026-10-29 (Go 250.000đ/tháng, 2.500.000đ/năm; Plus 400.000đ/tháng, 4.000.000đ/năm — GIÁ TẠM, chờ giá thật). **CHƯA deploy worker VB** (code đã sửa, chờ desktop mới) — xem mục "Chuyển đổi sang Identity Provider".
**Bổ sung 2026-10-29 (nhánh `feature/auth-email`, CHƯA merge / CHƯA deploy):** quên mật khẩu + xác thực email qua Resend — đã build + kiểm chứng local (xem mục "Quên mật khẩu + xác thực email (Resend)").
**Bổ sung 2026-10-30 (ĐÃ deploy production):** đã đặt `RESEND_API_KEY` + `EMAIL_FROM` (`HORA <no-reply@mail.hora.works>`) cho Pages project `hora-website`, áp migration `db/migrate-auth-2026-10-29.sql` lên D1 `hora-website` remote → **mail xác thực + quên mật khẩu hoạt động thật**. THÊM MỚI **mail xác nhận mua hàng thành công** (3 cổng SePay/MoMo/VNPay) — chỉ thông báo + link `/account.html`, KHÔNG kèm license key.

# Tài khoản khách + dashboard + thanh toán + Identity Provider (website)

## Phạm vi — đọc trước

**Website là Identity Provider (IdP) cho cả hệ sinh thái HORA.** Mọi tài khoản
khách (email/password) sống ở đây (`hora-website.customers`). Các app desktop
(Video Builder, Facebook Builder) **KHÔNG giữ user/password** — chúng chỉ nhận
một **token định danh** (opaque) từ web và gọi lại web để lấy license/plan.

- Website: đăng ký/đăng nhập, mua, xem license + thiết bị, tạo **mã kết nối
  app** (link code) để app desktop nhận định danh.
- App desktop: bấm "Kết nối tài khoản" → mở trang web → user đăng nhập → lấy
  mã → dán vào app → app đổi mã lấy token (qua `/api/identity/link-claim`).
- **HORA.Admin (tài khoản quản trị) TÁCH BIỆT HOÀN TOÀN** với tài khoản khách:
  bảng `users` (roles superadmin/license-admin) không bao giờ chung bảng hay
  chung hàng với `customers`.
- License/device/plan của app **dồn về web** (`hora-website.licenses`/
  `devices`). Worker VB chỉ verify token rồi hỏi web.

## Kiến trúc

```
Trình duyệt ── /account.html, /link (tĩnh, cùng origin)
            └─ /api/* (Cloudflare Pages Functions, repo này)
                 ├─ auth: register / login / logout / me
                 ├─ identity: link-create / link-claim / verify / revoke
                 ├─ licenses: GET danh sách, POST claim key đã có
                 ├─ app: bootstrap (bind device + plan), device-change
                 ├─ orders: POST tạo đơn, GET lịch sử giao dịch
                 └─ payments: SePay webhook / MoMo IPN / VNPay IPN / return
            D1 "hora-website" (binding DB trong wrangler.toml): db/schema.sql
            Cổng ngoài: SePay (cổng chính), MoMo, VNPay

App desktop (Video Builder) ── /api/identity/link-claim (lấy token)
                             └─ POST api.hora.works/api/video-builder/bootstrap{appToken}
                                  └─ worker VB gọi web: /api/identity/verify + /api/app/bootstrap
```


- **Mật khẩu:** PBKDF2-SHA256, 100.000 vòng, salt ngẫu nhiên riêng từng khách
  (WebCrypto). Không bao giờ lưu/log mật khẩu tho.
- **Session:** cookie `hora_session` (HttpOnly + Secure + SameSite=Lax, 30
  ngày); phía server chỉ lưu SHA-256 của token trong bảng `sessions`.
- **License:** lưu key thô trong `licenses.license_key` (khách cần copy để
  nhập/nhớ). License mua qua web hiển thị tier/hạn đầy đủ; license claim
  (dán key) mặc định tier `go`, hạn 30 ngày nếu không rõ.
- **License mua qua web:** sau khi IPN xác nhận đã trả tiền, website cấp
  license **trực tiếp trong DB web** (`licenses`, `source='purchase'`,
  `organization='user'`, `expiry_utc=NULL` — hạn đếm từ lần bind device đầu).
  Key được lưu thẳng trong `licenses.license_key` để khách copy từ dashboard.
  Không còn gọi endpoint ngoài, không còn trạng thái `paid_pending_issue`.
- **License claim (key đã có):** khách dán key → tạo row `licenses` với
  `source='claim'` nếu key chưa tồn tại; nếu đã thuộc tài khoản khác → 409.
- **IPN là nơi duy nhất được ghi "đã thanh toán"**, sau khi đã (1) xác minh
  chữ ký/checksum của cổng và (2) đối chiếu số tiền với đơn đã lưu. Trang
  `return` chỉ điều hướng về `/account.html`, không ghi trạng thái gì.

## Identity Provider — một tài khoản cho mọi app (2026-10-29)

Web phát **token opaque** cho app desktop; app gửi token kèm `deviceId` mỗi lần
bootstrap. VB worker verify token bằng cách **gọi web** (không giữ password).

**Luồng kết nối (link code):**
1. Trong `account.html`, khách bấm "Tạo mã kết nối" → `POST /api/identity/link-create`
   → tạo `app_links` code (`HORA-LINK-XXXXXXXX`, TTL 10 phút, dùng 1 lần).
2. App desktop bấm "Kết nối tài khoản" → mở `https://hora.works/link?code=...`
   (hoặc khách tự mở trang, nhập mã).
3. Khách dán mã vào app → app gọi `POST /api/identity/link-claim {code, deviceId}`
   → nhận `{userId, token, app}`; app lưu `token` vào keystore.
4. App bootstrap: `POST api.hora.works/api/video-builder/bootstrap {deviceId, appToken}`.

**Web là nguồn sự thật.** Worker VB (sau khi deploy) gọi server-to-server:
- `POST /api/identity/verify {token}` (header `X-Identity-Secret`) → `userId`.
- `POST /api/app/bootstrap {userId, app, deviceId}` → bind device + trả plan/expiry.

**Bảng (D1 `hora-website`):**
| Bảng | Việc |
| --- | --- |
| `app_links` | phiên kết nối (code, TTL, dùng 1 lần) |
| `app_tokens` | token app giữ (sha256; revoke bằng `revoked_at`) |
| `licenses` | license của mọi app (thay `customer_licenses` cũ) |
| `devices` | 1 license = 1 máy |
| `device_changes` | nhật ký đổi máy (cooldown 7 ngày) |

**Cấp license sau thanh toán:** webhook SePay → `tryIssueLicense` tạo row trong
`licenses` (`source='purchase'`, `organization='user'`, `expiry_utc=NULL` — hạn
bắt đầu đếm từ lần bind device đầu tiên). Không còn gọi endpoint ngoài.

**Secret:** `IDENTITY_INTERNAL_SECRET` (đặt ở CẢ Pages và worker VB) — xác thực
các lời gọi server-to-server `/api/identity/verify` và `/api/app/*`. Giá trị
lưu ở `~/.hora_identity_secret`, đặt qua `wrangler` secret (không commit).

## Chuyển đổi sang Identity Provider

Web (Pages) ĐÃ deploy. Worker VB + core ĐÃ deploy (2026-10-29) — `DB_VB` trong cả
`wrangler.video-builder.toml`, `wrangler.core.toml`, `wrangler.toml` đã trỏ
`hora-website`. Dữ liệu license cũ đã migrate từ `hora-vb` sang `hora-website`
(script `scripts/migrate-hora-vb.sh`).

Các phần còn lại:
1. [ ] **Desktop Video Builder**: thêm `LinkWindow` (nhập link code), đổi bootstrap
   `LicenseKey` → `AppToken`, lưu token vào keystore. (Việc riêng repo `video-builder`.)
   Hiện desktop cũ vẫn chạy nhánh `licenseKey` bình thường (đã verify production).
2. [x] **`hora-vb` ĐÃ XOÁ** (2026-10-29). Backup tại `~/hora-backups/hora-vb-*.sql`.
   License đã migrate xong sang `hora-website`; production verify vẫn chạy sau khi xoá.
3. [ ] `hora-fb` đã tạo lại (id `b660b49f-...`) vì DB cũ không tồn tại. Khi làm
   Facebook Builder: migrate/seed license FB vào đó.
4. [ ] HORA.Admin: đường **cấp license tay đã BỎ** (`POST /api/admin/licenses`
   trả `410 LICENSE_ISSUE_DISABLED`). Chỉ còn xem (GET list/search/detail).

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
| `RESEND_API_KEY` | Gửi email (xác thực / quên mật khẩu / mua hàng) | Secret của Resend — **ĐÃ đặt cho Pages project `hora-website` (production) 2026-10-30** (dùng chung key với account layer `mail.hora.works`). Thiếu key → mail bị bỏ qua + log `mail.skipped`, không lỗi |
| `EMAIL_FROM` | Gửi email | Địa chỉ gửi — **ĐÃ đặt `HORA <no-reply@mail.hora.works>` 2026-10-30** (domain `mail.hora.works` đã xác thực trong Resend). Mặc định nếu không đặt là `HORA <no-reply@hora.works>` |
| `SITE_URL` | Link trong email | Mặc định `https://hora.works`; chỉ đặt khi test/staging domain khác |
| `MAIL_DRY_RUN` | CHỈ test local | Đặt `1`: không gọi Resend, ghi log `mail.dry_run` kèm link hành động để lấy link test từ DB events local. **Không bao giờ bật trên production** (link chứa token tho) |

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

## Quên mật khẩu + xác thực email (Resend) — build 2026-10-29, nhánh `feature/auth-email`, CHƯA deploy

Hai tính năng chạy trên cùng một cơ chế **auth token dùng 1 lần** (bảng
`auth_tokens`): server chỉ lưu **SHA-256** của token; token tho chỉ xuất
hiện trong link gửi qua email. Phát hành token mới sẽ hủy mọi token chưa
dùng cùng khách + mục đích. Verify có hạn **24 giờ**, reset có hạn
**1 giờ**; token dùng xong/hủy đều bị đánh dấu `used_at` và không dùng
lại được.

**Endpoint (`functions/api/auth/`):**

| Endpoint | Việc |
| --- | --- |
| `POST /api/auth/verify-email {token}` | Dùng token `verify_email` → đặt `customers.email_verified_at`. Sai/đã dùng → `400 TOKEN_INVALID`; hết hạn → `400 TOKEN_EXPIRED` |
| `POST /api/auth/resend-verification` (cần đăng nhập) | Gửi lại email xác thực. Đã xác thực → `{ok:true, alreadyVerified:true}`; chưa → `{ok:true, mailConfigured, mailSent}` |
| `POST /api/auth/forgot-password {email}` | **Luôn** trả `200 {ok:true}` dù email có tồn tại hay không (chống dò email). Tồn tại → phát token `reset_password` + gửi mail |
| `POST /api/auth/reset-password {token, password}` | Mật khẩu ≥ 8 ký tự (`422 WEAK_PASSWORD`). Thành công → đổi hash + **xóa toàn bộ `sessions` của khách** (thu hồi mọi phiên đăng nhập), trả `{ok:true}` |

**Đăng ký:** sau khi tạo tài khoản, `POST /api/auth/register` tự phát
token verify + gửi mail; response `201 {registered:true, customer:{...,
emailVerified:false}, mailConfigured}` và **KHÔNG set session/cookie** —
đăng ký xong chưa vào được tài khoản. `GET /api/auth/me` trả thêm
`customer.emailVerified`. **Đăng nhập bị CHẶN khi chưa xác thực email**:
`POST /api/auth/login` trả `403 EMAIL_NOT_VERIFIED` nếu
`customers.email_verified_at` còn NULL. Khách phải bấm link xác thực
(`?verify=<token>`) rồi đăng nhập lại. Banner "Email của bạn chưa được xác
thực" + nút gửi lại vẫn còn cho trường hợp tài khoản cũ đã đăng nhập trước
đó; trang tài khoản tự xử lý link `?verify=<token>` (xác thực + xóa param
khỏi URL) và `?reset=<token>` (hiện form đặt mật khẩu mới).

**Gửi mail (`functions/api/_mail.js` → Resend API):**
- `isMailConfigured(env)`: có `RESEND_API_KEY` hay không. **ĐÃ cấu hình trên production
  2026-10-30** (key dùng chung với account layer `mail.hora.works`). Thiếu key → `sendEmail` trả
  `{sent:false, reason:'MAIL_NOT_CONFIGURED'}` và ghi event
  `mail.skipped` — **không throw, không làm vỡ bất kỳ luồng nào** (đăng
  ký vẫn 201, forgot vẫn 200). Có key → POST `api.resend.com/emails`;
  lỗi HTTP/mạng → event `mail.failed`, vẫn không throw; thành công →
  `mail.sent`. Không bao giờ log giá trị API key.
- `MAIL_DRY_RUN=1` (chỉ test local): không gọi Resend, ghi event
  `mail.dry_run` kèm **link hành động trong details** để test lấy link từ
  DB events local. Production tuyệt đối không bật.

**Mail xác nhận mua hàng thành công (2026-10-30):**
- `functions/api/payments/_notify.js` → `notifyPurchaseSuccess(env, order)` gọi
  `sendPurchaseSuccessEmail` (`_mail.js`) — **chỉ thông báo** (gói, thời hạn, số tiền) +
  link tới `/account.html` để khách xem license; **KHÔNG kèm license key** trong email.
- Gọi ở cả 3 webhook/IPN (`sepay-webhook.js`, `momo-ipn.js`, `vnpay-ipn.js`) **sau khi
  `tryIssueLicense` thành công** (không gửi khi đơn rơi vào `paid_pending_issue`).
  Lỗi gửi mail bị nuốt — không làm hỏng webhook đã ghi nhận tiền. Event: `mail.purchase_success`.

**Schema / migration:** DB mới cài bằng `db/schema.sql` đã gồm cột
`customers.email_verified_at` + bảng `auth_tokens`. DB remote **đã tồn tại** phải áp thêm file riêng trước khi deploy code này:
`npx wrangler d1 execute hora-website --remote --file db/migrate-auth-2026-10-29.sql`
(lưu ý tên DB hiện tại là `hora-website`). Lệnh `ALTER TABLE ... ADD
COLUMN` trong file chỉ chạy được 1 lần — chạy lại sẽ báo lỗi duplicate
column (đã ghi rõ trong comment đầu file). **ĐÃ ÁP lên D1 remote 2026-10-30.**

**Trạng thái gửi mail:** ĐÃ bật thật trên production 2026-10-30 — đã kiểm chứng end-to-end
qua `hora.works`: đăng ký → `mail.sent` (verify), forgot-password → `mail.sent` (reset),
webhook SePay (mô phỏng) → license cấp + `mail.purchase_success` `sent:true`. Dữ liệu test đã dọn.

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

## Đã kiểm chứng local — xác thực email + quên mật khẩu (2026-10-29, nhánh `feature/auth-email`)

- `node --check`: đạt cho toàn bộ file mới/sửa (`_lib.js`, `_mail.js`,
  `register.js`, `me.js`, `verify-email.js`, `resend-verification.js`,
  `forgot-password.js`, `reset-password.js`) + script inline của
  `account.html`.
- **Migration:** tạo DB local từ schema CŨ (ở `main`) → áp
  `db/migrate-auth-2026-10-29.sql` → `customers` có thêm
  `email_verified_at`, bảng `auth_tokens` + index được tạo. Chạy lại
  migration → báo đúng lỗi `duplicate column name: email_verified_at`
  như comment trong file đã ghi.
- `wrangler pages dev` + D1 local (schema mới), `MAIL_DRY_RUN=1`, không
  đặt `RESEND_API_KEY`: đăng ký → 201 (`emailVerified:false`,
  `mailConfigured:false`) → lấy link verify từ event `mail.dry_run`
  trong DB events local → `verify-email` → 200 → `me` trả
  `emailVerified:true` → dùng lại token → `400 TOKEN_INVALID` →
  `resend-verification` khi đã xác thực → `alreadyVerified:true`.
- Quên mật khẩu: email có thật và email không tồn tại đều trả `200
  {ok:true}` giống hệt → lấy link reset (dry-run) → `reset-password`
  → 200 → session cũ bị thu hồi (`me` bằng cookie cũ → 401) → đăng
  nhập mật khẩu cũ → 401, mật khẩu mới → 200 → token reset bị sửa
  `expires_at` về quá khứ → `400 TOKEN_EXPIRED` → mật khẩu yếu → `422
  WEAK_PASSWORD`. User thứ hai: `resend-verification` khi chưa xác
  thực → `{ok:true, mailConfigured:false, mailSent:false}`, token mới
  xác thực thành công.
- Chạy lại KHÔNG dry-run, KHÔNG `RESEND_API_KEY`: đăng ký vẫn 201,
  forgot vẫn 200, token rác → 400 (không 500); events ghi
  `mail.skipped` với `reason: MAIL_NOT_CONFIGURED` cho cả verify và
  reset. Đã dọn `.wrangler/` local sau test.
- **Chưa** kiểm chứng: gửi mail THẬT qua Resend (chưa có API key —
  đang để trống theo quyết định của user), áp migration lên D1 remote,
  deploy nhánh này.
