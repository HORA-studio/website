GÓI TRIỂN KHAI — CHƯA IMPLEMENT (chỉ phần vá lỗi + đối soát + kiểm chứng mô tả trong gói này chưa làm; phần cấp license cốt lõi ĐÃ có ở HEAD — xem mục 1)

# Gói triển khai: cấp license tự động cho đơn web đã thanh toán

- **Ngày soạn:** 2026-10-29
- **Dựa trên:** repo `website`, `main` ở commit `4e0c3ae` ("Merge branch
  'feature/linear-ui'"). Mọi khẳng định dưới đây đều trích từ code/docs tại
  HEAD này; chỗ nào repo không đủ bằng chứng thì ghi **CHƯA XÁC ĐỊNH** kèm
  cách kiểm chứng — không đoán.
- **Quan hệ với spec cũ:** gói này THAY THẾ hướng triển khai trong
  `docs/customer-license-issue-endpoint.md` (soạn buổi sáng 2026-10-29, khi
  license còn thuộc hệ Worker). Kiến trúc đã đổi trong ngày (commit
  `b046c65` Identity Provider + `8a60225` gộp bảng license/device vào
  schema web) nên kết luận về nơi đặt endpoint đã ngược với spec cũ.

---

## 1. KẾT LUẬN: endpoint cấp license nằm ở PHÍA WEBSITE — và ĐÃ ĐƯỢC IMPLEMENT ở HEAD

Không cần xây `POST /api/internal/issue-web-order` trên Worker nữa. Bằng
chứng trong repo tại HEAD:

1. **Website đã nắm toàn bộ dữ liệu license:** `db/schema.sql` (HEAD) có đủ
   `licenses`, `devices`, `plans`, `device_changes`, `app_links`,
   `app_tokens` trong D1 `hora-website` — cùng DB với `orders`/`payments`.
   Comment trong schema ghi rõ: "License (nguon su that duy nhat cho MOI
   app…)" và "Schema nay la CHUAN DUNG CHUNG giua web (Pages) va worker app
   (hora-worker-vb doc cheo qua binding DB_VB)".
2. **Hàm cấp đã tồn tại và đã được cả 3 cổng gọi:**
   `tryIssueLicense(env, order)` tại `functions/api/_lib.js:195` — INSERT
   thẳng một row vào `licenses` rồi UPDATE `orders` sang `status='paid'` +
   `license_id`. Ba nơi gọi: `functions/api/payments/sepay-webhook.js:92`,
   `functions/api/payments/momo-ipn.js:56`,
   `functions/api/payments/vnpay-ipn.js:63`.
3. **Đường cấp tay phía Worker đã bị tắt:** `docs/customer-accounts.md`
   (mục "Chuyển đổi sang Identity Provider") ghi `POST /api/admin/licenses`
   trả `410 LICENSE_ISSUE_DISABLED`, HORA.Admin chỉ còn đọc;
   `docs/TODO-verify-admin.md` mục 3 có checklist kiểm chứng đúng hành vi
   410 này. Tức phía Worker không còn là nơi sinh license nữa.
4. **Không còn khoá ký/chứng thư RSA nào trong luồng web:** grep toàn bộ
   `functions/` tại HEAD không có RSA/PKCS/chữ ký chứng thư — chỉ có HMAC
   của các cổng thanh toán trong `functions/api/payments/_gateway.js`.
   License trong kiến trúc hiện tại là **một row dữ liệu + key mờ
   (opaque)**, app xác thực **online**: worker VB gọi
   `POST /api/identity/verify` và `POST /api/app/bootstrap`
   (`functions/api/identity/verify.js`, `functions/api/app/bootstrap.js`,
   xác thực server-to-server bằng header `X-Identity-Secret` so với env
   `IDENTITY_INTERNAL_SECRET`) để web bind device + trả
   `licenseValid/plan/expiry`. Không có bước ký chứng thư ở phía web.
   - Hệ quả: format wire cũ của hệ .NET/Worker cũ (key
     `PREFIX_{32 hex}`, RSA PKCS#1 v1.5 + SHA-256, cert canonical v2)
     **không còn xuất hiện trong repo này** và không áp dụng cho gói này.
     Riêng định dạng key thì vẫn giữ mẫu `<PREFIX>_<32 hex HOA>`:
     `LICENSE_KEY_RE = /^[A-Z][A-Z0-9]*_[0-9A-F]{32}$/` và
     `newLicenseKey(prefix)` tại `functions/api/_lib.js:172-181`.
   - Comment đầu `functions/api/app/bootstrap.js` có câu "tra plan/expiry
     de VB ky cho client" — tức phía worker VB có thể còn một bước ký cho
     desktop client. **Khoá và format của bước ký đó nằm ở repo
     `hora-worker` (máy user), repo website không có bằng chứng — CHƯA XÁC
     ĐỊNH, xem mục 6 điểm C1.** Nếu bước ký đó chỉ ký trên dữ liệu
     plan/expiry do web trả thì không ảnh hưởng kết luận của gói này.

**Việc còn lại thật sự phải làm** (nội dung triển khai của gói này) không
phải "xây endpoint", mà là: vá các lỗ hổng idempotency/đường lỗi của
`tryIssueLicense` (mục 3), thêm đường retry/đối soát cho đơn kẹt (mục 4),
và chạy checklist kiểm chứng đầu-cuối (mục 7).

---

## 2. Trạng thái hiện tại ở HEAD — `tryIssueLicense` làm gì

`functions/api/_lib.js:188-212` (comment + hàm):

| Thuộc tính | Giá trị ở HEAD | Nguồn |
| --- | --- | --- |
| `id` | 32 hex thường, ngẫu nhiên (`newLicenseId()`) | `_lib.js` |
| `license_key` | `newLicenseKey("HORA")` → `HORA_<32 hex HOA>` | `_lib.js:201` |
| `customer_id` | `order.customer_id` | `_lib.js` |
| `app` / `product_id` | `appForPlan(order.plan)` — hiện **mọi plan đều → `video-builder`** | `_lib.js` (`PLAN_APP`) |
| `tier` | `order.plan` (`go`/`plus`) | `_lib.js` |
| `status` | `'active'` | `_lib.js` |
| `organization` | **`'user'`** (đúng luật user đã chốt: mua web = `user`, cấp tay = `admin`) | `_lib.js` |
| `expiry_utc` | `NULL` — hạn đếm từ lần bind device đầu tiên | `_lib.js`; logic đếm ở `app/bootstrap.js` |
| `validity_days` | `30` (month) / `365` (year) theo `order.period` | `_lib.js` |
| `source` | `'purchase'` | `_lib.js` |
| `order_id` | `order.id` (cột đã có trong schema, `licenses.order_id REFERENCES orders(id)`) | `db/schema.sql` |
| Sau cấp | `UPDATE orders SET status='paid', license_id=<id mới>`; hàm `return true` | `_lib.js` |

Luồng theo cổng ở HEAD:

- **SePay** (`sepay-webhook.js`): đối mã + đúng số tiền → UPDATE payments
  `paid` → UPDATE orders `paid`+`paid_at` → `tryIssueLicense` → log event
  `payment.paid`. Chống trùng theo `gateway_trans_id` (giao dịch đã
  `paid`/`amount_mismatch` → trả `duplicate:true`).
- **VNPay** (`vnpay-ipn.js:36`): có guard — đơn đã `paid` hoặc
  `paid_pending_issue` → trả RspCode `02` (đã xác nhận), không cấp lại.
- **MoMo** (`momo-ipn.js`): verify chữ ký + số tiền → ghi payments/orders
  `paid` → `tryIssueLicense`. **Không có guard trạng thái đơn.**

Khách xem license ở dashboard qua `GET /api/licenses`
(`functions/api/licenses/index.js`: trả key tho để copy, tier, expiry,
`deviceBound`), nên license cấp xong là thấy ngay — không cần bước đồng bộ
nào thêm.

---

## 3. Các lỗ hổng phải vá (phần implement chính của gói)

### L1 — `tryIssueLicense` KHÔNG idempotent; MoMo IPN gọi lại sẽ cấp 2 license

- `tryIssueLicense` không kiểm tra license đã có theo `order_id` — mỗi lần
  gọi là một INSERT mới, và `orders.license_id` bị ghi đè sang license mới
  nhất. Spec cũ yêu cầu idempotent theo `orderId`; bản website hiện chưa
  đạt.
- MoMo IPN không có guard như VNPay: MoMo retry IPN (hành vi bình thường
  của cổng) → cấp thêm license. SePay an toàn nhờ guard theo
  `gateway_trans_id`, VNPay an toàn nhờ guard theo trạng thái đơn — nhưng
  lớp bảo vệ đúng phải nằm trong chính `tryIssueLicense`.

**Cách vá (trong `_lib.js`, sửa tối thiểu, giữ nguyên chữ ký hàm):**

```js
export async function tryIssueLicense(env, order) {
  // Idempotent theo order_id: da cap roi -> chi dong bo lai orders, khong cap moi.
  const existing = await env.DB.prepare(
    "SELECT id FROM licenses WHERE order_id = ?1 LIMIT 1"
  ).bind(order.id).first();
  if (existing) {
    await env.DB.prepare("UPDATE orders SET status = 'paid', license_id = ?2 WHERE id = ?1")
      .bind(order.id, existing.id).run();
    return true;
  }
  // ... phan INSERT nhu hien tai, khong thay doi ...
}
```

Đề xuất thêm (tùy chọn, cùng đợt): index `idx_licenses_order` trên
`licenses(order_id)` trong `db/schema.sql` + 1 file migration nhỏ cho DB
remote đã tồn tại — `order_id` không có UNIQUE trong schema hiện tại nên
index chỉ để tra cứu nhanh, tính idempotent do code đảm bảo.

### L2 — Đường lỗi chưa thành code: cả 3 handler KHÔNG bọc `tryIssueLicense` trong try/catch

Comment ở cả 3 handler đều viết "thất bại -> `paid_pending_issue`"
(`sepay-webhook.js:87`, `momo-ipn.js:54`, comment trạng thái trong
`db/schema.sql` ở bảng `orders`), nhưng code ở HEAD **không có try/catch
nào** quanh lời gọi. Hệ quả thực tế nếu INSERT lỗi (DB chập chờn, schema
lệch…):

- **SePay:** payments + orders đã ghi `paid` trước khi gọi cấp; webhook
  văng lỗi 500 → SePay retry → guard `gateway_trans_id` trả
  `duplicate:true` → **không bao giờ cấp lại** → đơn `paid` nhưng
  `license_id` NULL, kẹt vĩnh viễn và im lặng.
- **MoMo:** IPN văng lỗi → MoMo retry → (sau khi vá L1) an toàn; trước khi
  vá L1 thì cấp trùng (L1).
- **VNPay:** đơn đã `paid` → lần gọi sau trả `02` → cũng kẹt như SePay.

**Cách vá (áp cho cả 3 handler, mẫu theo SePay; hai cổng còn lại tương
tự):**

```js
try {
  await tryIssueLicense(env, { ...order, email: cust ? cust.email : null });
} catch (e) {
  // Da nhan tien nhung cap license loi -> dua ve paid_pending_issue de doi soat/retry (muc 4).
  await env.DB.prepare("UPDATE orders SET status = 'paid_pending_issue' WHERE id = ?1")
    .bind(order.id).run();
  await logEvent(env, { eventType: "license.issue_failed", customerId: order.customer_id,
    actor: "sepay", ip: clientIp(request), details: { orderId: order.id, error: String(e && e.message || e) } });
  // Van tra thanh cong cho cong (tien da ghi nhan dung), viec cap lai do muc 4 dam nhiem.
}
```

Lưu ý giữ đúng hợp đồng trả lời của từng cổng (SePay vẫn `200
{success:true}`, MoMo vẫn `204`, VNPay vẫn RspCode `00`) — tiền đã ghi
nhận đúng thì không được báo lỗi về cổng, tránh cổng retry gây trùng
thanh toán.

### L3 — Prefix key: web đang cấp `HORA_`, dữ liệu migrate là `VBB_`

- Web cấp key prefix `"HORA"` (`newLicenseKey("HORA")`, `_lib.js:201`),
  trong khi 4 license Video Builder đã migrate mang prefix `VBB_`
  (`docs/TODO-verify-admin.md` mục 1: "tier `plus`, prefix `VBB_`").
- Trong repo website, prefix không bị kiểm tra theo app ở bất kỳ đâu:
  `LICENSE_KEY_RE` chấp nhận mọi prefix, `licenses/claim.js` cũng vậy,
  `app/bootstrap.js` tra license theo `customer_id + app` chứ không nhìn
  key. Nên **trong phạm vi web, `HORA_` hoạt động bình thường**.
- **CHƯA XÁC ĐỊNH:** nhánh desktop cũ (luồng `licenseKey` qua worker VB —
  theo `docs/customer-accounts.md`, desktop cũ vẫn chạy nhánh này trên
  production) có kiểm tra prefix theo product hay không. Cách kiểm chứng +
  xử lý: xem mục 6 điểm C2. Nếu có kiểm tra, cách vá là đổi lời gọi thành
  `newLicenseKey(prefixForApp(app))` với mapping `video-builder → 'VBB'`
  trong `_lib.js` — **chỉ áp dụng sau khi có bằng chứng**, không tự đổi
  trước.

### L4 — Mọi plan đang trỏ về một app duy nhất

`PLAN_APP` trong `_lib.js`: `go` và `plus` đều → `video-builder`. Đúng
với hiện tại (web mới bán Video Builder), nhưng khi mở bán Facebook
Builder phải sửa mapping này + cột `app` của đơn (hiện `orders` không lưu
`app` — app suy ra từ plan tại thời điểm cấp). Ghi nhận để không quên;
không thuộc phạm vi vá đợt này.

---

## 4. Đơn kẹt `paid_pending_issue` / `paid` thiếu license: đối soát + retry

### 4.1 Truy vấn đối soát (chạy trên D1 `hora-website` remote qua wrangler của user)

```sql
-- Don da nhan tien nhung chua co license (ke ca 'paid' bi ket do loi truoc khi co co che moi):
SELECT o.id, o.customer_id, o.plan, o.period, o.status, o.paid_at
FROM orders o
WHERE o.status IN ('paid', 'paid_pending_issue')
  AND NOT EXISTS (SELECT 1 FROM licenses l WHERE l.order_id = o.id);

-- Don paid_pending_issue con ton:
SELECT id, customer_id, plan, period, paid_at FROM orders
WHERE status = 'paid_pending_issue' ORDER BY paid_at ASC;
```

### 4.2 Endpoint retry nội bộ (file mới `functions/api/internal/retry-issue.js`)

Thiết kế bám đúng pattern server-to-server đã có trong repo
(`secretOk` trong `identity/verify.js` / `app/bootstrap.js`):

- **Route:** `POST /api/internal/retry-issue`
- **Auth:** header `X-Identity-Secret` khớp env `IDENTITY_INTERNAL_SECRET`
  (dùng lại secret hiện hữu — không đẻ thêm secret mới). Sai/thiếu → `401
  {error:{code:"UNAUTHORIZED",…}}` theo format lỗi chuẩn của `_lib.js`.
- **Body:** `{ "orderId": "HORA-…" }` — thiếu → `422`.
- **Hành vi:**
  1. Đọc order; không có → `404 {error:{code:"ORDER_NOT_FOUND",…}}`.
  2. Order chưa ở trạng thái `paid`/`paid_pending_issue` → `409
     {error:{code:"ORDER_NOT_PAID",…}}`.
  3. Đã có license theo `order_id` → đồng bộ `orders.license_id` +
     `status='paid'`, trả `200 { ok:true, alreadyIssued:true, licenseId }`.
  4. Chưa có → gọi `tryIssueLicense(env, order)` (đã idempotent sau vá
     L1) → `200 { ok:true, alreadyIssued:false, licenseId }` (lấy
     `licenseId` từ `orders.license_id` sau khi cấp).
  5. Lỗi khi cấp → giữ `paid_pending_issue`, trả `500
     {error:{code:"ISSUE_FAILED",…}}` + log event `license.issue_failed`.
- **Ai gọi:** user/admin chạy tay bằng curl từ máy có secret (secret nằm ở
  `~/.hora_identity_secret` theo `docs/customer-accounts.md`), hoặc một
  cron ngoài hệ thống quét truy vấn 4.1 rồi gọi endpoint này cho từng đơn.
  Không có UI cho khách; khách không gọi được (không có secret).

Khung handler (implement theo đúng style các handler hiện tại):

```js
// POST /api/internal/retry-issue { orderId } — goi noi bo (X-Identity-Secret)
// de cap lai license cho don da tra tien nhung chua co license.
import { json, errorJson, readJson, tryIssueLicense } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

function secretOk(request, env) { /* copy nguyen mau tu identity/verify.js */ }

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Sai hoặc thiếu X-Identity-Secret.", 401);
  const body = await readJson(request);
  const orderId = String((body && body.orderId) || "").trim();
  if (!orderId) return errorJson("INVALID_ORDER", "Thiếu orderId.", 422);

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?1").bind(orderId).first();
  if (!order) return errorJson("ORDER_NOT_FOUND", "Không tìm thấy đơn.", 404);
  if (order.status !== "paid" && order.status !== "paid_pending_issue") {
    return errorJson("ORDER_NOT_PAID", "Đơn chưa ở trạng thái đã thanh toán.", 409);
  }

  const existing = await env.DB.prepare("SELECT id FROM licenses WHERE order_id = ?1 LIMIT 1").bind(orderId).first();
  if (existing) {
    await env.DB.prepare("UPDATE orders SET status = 'paid', license_id = ?2 WHERE id = ?1")
      .bind(orderId, existing.id).run();
    return json({ ok: true, alreadyIssued: true, licenseId: existing.id });
  }

  try {
    await tryIssueLicense(env, order);
  } catch (e) {
    await logEvent(env, { eventType: "license.issue_failed", actor: "internal-retry",
      ip: clientIp(request), details: { orderId, error: String(e && e.message || e) } });
    return errorJson("ISSUE_FAILED", "Cấp license thất bại, đơn giữ ở paid_pending_issue.", 500);
  }
  const after = await env.DB.prepare("SELECT license_id FROM orders WHERE id = ?1").bind(orderId).first();
  return json({ ok: true, alreadyIssued: false, licenseId: after ? after.license_id : null });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
```

### 4.3 Cấp tay dự phòng (khi chưa deploy được retry endpoint)

Chạy trên D1 remote bằng wrangler của user — mẫu bám đúng INSERT của
`tryIssueLicense` (thay `<…>` bằng giá trị thật của đơn; `id` và phần hex
của key tự sinh ngẫu nhiên 32 hex):

```sql
INSERT INTO licenses
  (id, license_key, customer_id, app, product_id, tier, status, organization,
   expiry_utc, validity_days, activated_at, revoked_at, source, order_id, created_at)
VALUES
  ('<license_id 32 hex>', 'HORA_<32 HEX HOA>', '<customer_id>', 'video-builder',
   'video-builder', '<go|plus>', 'active', 'user', NULL, <30|365>, NULL, NULL,
   'purchase', '<order_id>', '<ISO now>');
UPDATE orders SET status = 'paid', license_id = '<license_id 32 hex>' WHERE id = '<order_id>';
```

---

## 5. Biến môi trường / secret liên quan

| Biến | Đặt ở | Trạng thái / ghi chú |
| --- | --- | --- |
| `LICENSE_ISSUE_URL` | — | **KHÔNG CẦN NỮA.** Chỉ còn trong spec cũ + bảng env của `docs/customer-accounts.md` (đã lỗi thời — xem mục 8). Không đặt. |
| `LICENSE_ISSUE_SECRET` | — | **KHÔNG CẦN NỮA** (như trên). |
| `IDENTITY_INTERNAL_SECRET` | Pages (website) **và** worker VB | Đang là secret server-to-server hiện hữu (`identity/verify`, `app/bootstrap`, `app/device-change`, `identity/revoke` đều dùng). Retry endpoint (mục 4.2) dùng lại secret này. Giá trị ở `~/.hora_identity_secret`, đặt bằng wrangler secret — theo `docs/customer-accounts.md`. |
| `SEPAY_WEBHOOK_API_KEY`, `SEPAY_BANK_*` | Pages | Đã có từ luồng SePay; không đổi. |
| `DB` (binding D1 `hora-website`) | Pages + worker (`DB_VB`) | Đã trỏ cùng một DB theo `docs/customer-accounts.md`; cấp license ghi vào chính DB này nên web/worker thấy cùng dữ liệu ngay, không cần đồng bộ. |

Không cần thay đổi schema cho gói này: `licenses.order_id`,
`orders.license_id`, `orders.status` (gồm giá trị `paid_pending_issue`)
đều đã có ở HEAD.

---

## 6. Các điểm CHƯA XÁC ĐỊNH (phải kiểm chứng ở repo/máy user trước hoặc trong lúc triển khai)

| # | Điểm chưa xác định | Vì sao repo website không trả lời được | Cách kiểm chứng |
| --- | --- | --- | --- |
| C1 | Worker VB "ký cho client" bằng khoá/format gì (comment trong `app/bootstrap.js`) — có phải RSA chứng thư như hệ cũ không, và khoá nằm ở đâu | Code worker nằm ở repo `hora-worker` trên máy user, không có trong repo này | Mở repo `hora-worker` (đường dẫn theo `docs/TODO-verify-admin.md`: `~/HORA/hora-worker`), tìm handler bootstrap của video-builder + từ khoá `sign`, `RSA`, `private`, `cert` |
| C2 | Desktop bản cũ (nhánh `licenseKey`) có kiểm tra prefix key theo product (`VBB_` cho Video Builder) hoặc bắt buộc chứng thư offline không | Desktop + worker đều ngoài repo này; trong web không có kiểm tra prefix nào | Trong `hora-worker`: tìm nơi validate license key khi bootstrap bằng `licenseKey` (LicenseStore) — có so prefix/`product_id` không; và/hoặc test thực tế: claim 1 key `HORA_…` do web cấp vào desktop cũ xem có được chấp nhận không |
| C3 | Bảng `plans` trên D1 remote đã seed đủ 3 tier (go/plus/pro) cho `video-builder` chưa | Schema chỉ tạo bảng, dữ liệu seed nằm ở bước migrate phía user | Checklist `docs/TODO-verify-admin.md` mục 4 (admin `GET /api/admin/video-builder/plans` phải trả 3 gói) hoặc `SELECT * FROM plans` qua wrangler remote |
| C4 | Trạng thái deploy thật tại thời điểm áp gói (web Pages + worker core/VB đã lên đúng HEAD chưa) | Phụ thuộc Cloudflare của user; repo chỉ cho biết code | Đối chiếu bản deploy mới nhất trong Cloudflare Pages + làm checklist `docs/TODO-verify-admin.md` |
| C5 | Đơn `paid_pending_issue` có đang tồn đọng trên remote không, bao nhiêu đơn | Dữ liệu production, không có trong repo | Chạy truy vấn ở mục 4.1 trên D1 remote |

Nếu C2 cho kết quả "desktop cũ bắt buộc prefix `VBB_` hoặc chứng thư
riêng", phần phải đổi vẫn nằm trong website (mapping prefix theo app
trong `_lib.js`, mục 3-L3) — **trừ** trường hợp bắt buộc chứng thư ký bởi
khoá chỉ có ở Worker: khi đó mới quay lại phương án endpoint phía Worker
theo hợp đồng cũ trong `docs/customer-license-issue-endpoint.md`
(`POST /api/internal/issue-web-order`, header `X-Issue-Secret`, idempotent
theo `orderId`, response `{licenseKey, licenseId, tier, expiresAt}`), và
`tryIssueLicense` phải được viết lại thành lời gọi HTTP tới endpoint đó.
Đây là phương án dự phòng có điều kiện, không phải khuyến nghị hiện tại.

---

## 7. Checklist kiểm chứng đầu-cuối

### 7.1 Local (VM, `wrangler pages dev` + D1 local — áp `db/schema.sql`)

- [ ] Tạo đơn SePay (đặt biến `SEPAY_*` test) → gọi `sepay-webhook` đúng
      mã + đúng tiền → đơn `paid`, có `license_id`; `GET /api/licenses`
      (đăng nhập cùng khách) thấy license: tier đúng plan, `organization`
      = `user` (kiểm qua SQL local), key copy được.
- [ ] Gọi lại cùng webhook (cùng `id` giao dịch) → `duplicate:true`, đếm
      license theo `order_id` vẫn = **1**.
- [ ] Giả lập IPN MoMo/VNPay gọi **2 lần** cho cùng đơn (sau vá L1) →
      vẫn đúng **1** license, `orders.license_id` không đổi.
- [ ] Giả lập lỗi khi cấp (vd tạm đổi tên bảng `licenses` ở DB local) →
      cả 3 cổng vẫn trả thành công về phía cổng, đơn thành
      `paid_pending_issue`, có event `license.issue_failed`.
- [ ] Khôi phục bảng → gọi `POST /api/internal/retry-issue` với
      `X-Identity-Secret` đúng → đơn về `paid`, có license; gọi lại lần 2
      → `alreadyIssued:true`, không thêm license. Sai secret → `401`.
- [ ] Token app + `POST /api/app/bootstrap` (secret đúng, device mới) →
      `licenseValid:true`, `plan` đúng tier, `expiry` = now +
      `validity_days`; gọi lại cùng device → vẫn valid; device khác →
      `needsActivation:true` reason `device_bound`.

### 7.2 Remote / production (sau khi deploy bản vá + user xác nhận C3/C4)

- [ ] Chạy đối soát mục 4.1: xử lý hết đơn kẹt (nếu có) bằng retry
      endpoint hoặc cấp tay mục 4.3.
- [ ] Một đơn test thật (SePay, số tiền nhỏ theo giá tạm): chuyển khoản
      đúng mã → trong ~1 phút đơn `paid` + dashboard khách thấy license.
- [ ] App desktop: tạo mã kết nối ở dashboard → claim trong app →
      bootstrap trả `licenseValid:true` đúng plan của đơn test.
- [ ] HORA.Admin: `GET /api/admin/licenses` thấy license mới với
      `organization='user'`, `source='purchase'` (đối chiếu
      `docs/TODO-verify-admin.md` mục 1–2).
- [ ] Revoke license test từ Admin → bootstrap của app trả
      `licenseValid:false`; Restore → valid lại (mục 5 của
      `docs/TODO-verify-admin.md`).

---

## 8. Việc dọn dẹp docs/code liên quan (ghi nhận, KHÔNG làm trong gói này)

Các chỗ đã lỗi thời so với HEAD — để đợt dọn docs riêng xử lý, tránh sửa
lan ngoài phạm vi:

- `docs/customer-license-issue-endpoint.md`: toàn bộ spec đã bị kiến trúc
  mới thay thế (gói này thay thế nó).
- `docs/customer-accounts.md`: checklist go-live mục 5 (vẫn ghi "Implement
  endpoint cấp license phía hệ license… việc riêng phía Worker"), bảng
  biến môi trường còn 2 dòng `LICENSE_ISSUE_URL`/`LICENSE_ISSUE_SECRET`
  ghi "chưa tồn tại", mục SePay bước 4 còn câu "(chưa có endpoint cấp ->
  `paid_pending_issue`)", và lệnh áp schema còn ghi `hora-core` trong khi
  DB hiện tại là `hora-website`.
- Comment trong `sepay-webhook.js:87` và `momo-ipn.js:54` ("chưa cấu hình
  endpoint cấp" / "nếu endpoint nội bộ đã cấu hình") — sẽ đúng lại sau
  khi vá L2 biến đường `paid_pending_issue` thành code thật.
- Comment đầu `db/schema.sql` vẫn ghi "D1 (hora-core)" trong khi
  `wrangler.toml` ở HEAD đã là `hora-website` +
  `hora-website-events`.

## 9. Danh sách file đụng tới khi implement gói này

| File | Thay đổi |
| --- | --- |
| `functions/api/_lib.js` | Vá L1: nhánh idempotent đầu `tryIssueLicense` (không đổi chữ ký/chuỗi INSERT hiện tại) |
| `functions/api/payments/sepay-webhook.js` | Vá L2: try/catch quanh `tryIssueLicense` → `paid_pending_issue` + log event |
| `functions/api/payments/momo-ipn.js` | Vá L2: như trên (guard trạng thái do L1 đảm nhiệm) |
| `functions/api/payments/vnpay-ipn.js` | Vá L2: như trên |
| `functions/api/internal/retry-issue.js` | **Mới:** endpoint retry nội bộ (mục 4.2) |
| `db/schema.sql` + migration nhỏ (tùy chọn) | Thêm index `idx_licenses_order` nếu chọn làm cùng đợt |

Không cần: endpoint mới phía Worker, biến `LICENSE_ISSUE_*`, thay đổi
schema bắt buộc nào, thay đổi phía HORA.Admin.
