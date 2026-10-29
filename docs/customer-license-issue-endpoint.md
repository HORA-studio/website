SPEC — CHƯA IMPLEMENT

# Endpoint nội bộ cấp license cho đơn mua trên website (bản đặc tả)

> Trạng thái: **chỉ là đặc tả trên giấy, nằm trong repo website**. Endpoint này
> thuộc hệ license (Worker prod `api.hora.works`) và **chưa được implement ở
> bất cứ đâu**. Website đã có sẵn hook gọi nó (`tryIssueLicense` trong
> `functions/api/_lib.js`): khi chưa cấu hình `LICENSE_ISSUE_URL` /
> `LICENSE_ISSUE_SECRET`, đơn đã trả tiền sẽ nằm ở trạng thái
> `paid_pending_issue` để cấp tay — website không tự bịa key.
>
> Phạm vi quản trị: tài khoản khách, đơn hàng và thanh toán chỉ sống ở
> website (Pages Functions + D1 `hora-core`). HORA.Admin (app desktop quản
> trị license) **không** quản lý tài khoản khách và không nằm trong luồng này.

## Mục đích

Sau khi IPN của MoMo/VNPay xác nhận đơn đã thanh toán, website cần một cách
để hệ license cấp **đúng một license** cho đơn đó và trả key về đúng một lần
để website lưu cho khách xem/copy trong dashboard của họ.

## Đặc tả

- **Method/URL:** `POST /api/internal/issue-web-order` (trên `api.hora.works`)
- **Auth:** header `X-Issue-Secret: <shared secret>` — secret chỉ nằm ở secret
  của Pages project (website) và của Worker, không bao giờ xuất hiện ở
  trình duyệt. Sai/thiếu secret -> `401 {error:{code:"ISSUE_UNAUTHORIZED",...}}`.
- **Request JSON:**

  ```json
  { "orderId": "HORA-XXXXXX-YYYYYY", "email": "khach@example.com", "plan": "go | plus", "period": "month | year" }
  ```

- **Hành vi phía hệ license:**
  - Cấp license cho sản phẩm **HORA Media**, `tier` suy từ `plan`
    (`go` -> Go, `plus` -> Plus), thời hạn suy từ `period`
    (month = 1 tháng, year = 1 năm) tính từ thời điểm cấp.
  - License phải gắn **`organization = 'user'`** (luật tổ chức phía server:
    `admin` = cấp tay, `user` = khách tự mua qua web) để báo cáo doanh thu
    tách đúng nguồn.
  - Ghi nhận liên kết đơn: `orderId` + email khách vào hồ sơ license/audit
    (phục vụ đối soát, không thay đổi wire format của chứng thư license).
- **Idempotent theo `orderId`:** gọi lại với cùng `orderId` phải trả về
  **đúng license đã cấp cho đơn đó** (cùng key), không cấp thêm license mới.
  Đây là điều kiện bắt buộc vì IPN có thể gọi lại và website có thể retry.
- **Response thành công (`200`):**

  ```json
  { "licenseKey": "HORA_0123ABCD... (32 hex)", "licenseId": "<id>", "tier": "go | plus", "expiresAt": "<ISO 8601>" }
  ```

  Key chỉ được trả qua kênh server-to-server này; website lưu hash + bản tho
  (chỉ với key do mua mà có) để khách copy trong dashboard của chính họ.
- **Response lỗi:** `4xx/5xx` + `{error:{code,message}}` theo format lỗi
  chuẩn của API. Website nhận lỗi sẽ giữ đơn ở `paid_pending_issue`.

## Biến môi trường phía website (khi endpoint này được implement)

- `LICENSE_ISSUE_URL` = `https://api.hora.works/api/internal/issue-web-order`
- `LICENSE_ISSUE_SECRET` = shared secret (đặt bằng `wrangler pages secret put`,
  không commit vào repo).
